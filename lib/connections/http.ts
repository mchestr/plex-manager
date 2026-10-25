import "server-only"

import type { z } from "zod"

import { createLogger } from "@/lib/utils/logger"
import { type ConnectionResult } from "@/types/connection"

/**
 * The one outbound HTTP helper for the self-hosted services (Plex, Tautulli,
 * Overseerr, Sonarr, Radarr).
 *
 * ## What every call gets
 *
 * - **A timeout that covers the body.** The signal is
 *   `AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])` and stays live
 *   while the body is read, so a slow body cannot outlast the budget.
 * - **Safe redirects.** Redirects are followed by hand, at most
 *   {@link MAX_REDIRECTS} hops, to `http:` or `https:` only. A cross-origin hop
 *   drops `X-Api-Key`, `X-Goog-Api-Key`, `X-Plex-Token`, `X-Emby-Token` and
 *   `Authorization`.
 * - **Zod parsing.** A body that fails the schema is `INVALID_RESPONSE`; only
 *   the issue paths are logged, never values.
 * - **Key-free errors.** A failure is a code and maybe a status. Logs carry the
 *   host and path only, never the query (Tautulli keys live there) or an
 *   `error.message` (Node puts the whole URL in some of them).
 *
 * @example
 * ```ts
 * const result = await serviceFetch({
 *   service: "Sonarr",
 *   url: "http://sonarr:8989/api/v3/system/status",
 *   headers: { "X-Api-Key": key },
 *   schema: z.looseObject({ version: z.string() }),
 * })
 * if (!result.ok) return serviceErrorMessage("Sonarr", result) // "Sonarr returned HTTP 401"
 * ```
 *
 * @module lib/connections/http
 */

const logger = createLogger("HTTP")

export type ServiceErrorCode =
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK"
  | "HTTP"
  | "REDIRECT_BLOCKED"
  | "INVALID_RESPONSE"
  | "UPSTREAM_ERROR"

/** An HTTP failure's body and status text, kept only when the caller sets `readErrorBody`. */
interface ServiceErrorDetail {
  /** The parsed JSON body, or `undefined` when it was not JSON. Untrusted: parse it with Zod. */
  body: unknown
  statusText: string
}

export type ServiceFailure<C extends string = ServiceErrorCode> = {
  ok: false
  code: C
  status?: number
  detail?: ServiceErrorDetail
  /** The service's own `message` for a 4xx when `readErrorMessage` asked for it, at most 200 characters. */
  message?: string
}
export type ServiceResult<T, C extends string = ServiceErrorCode> = { ok: true; data: T } | ServiceFailure<C>

export interface ServiceFetchOptions<T> {
  /** Display name used in messages and logs, e.g. "Tautulli". */
  service: string
  url: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  headers?: Record<string, string>
  body?: string
  schema: z.ZodType<T>
  /** How to read the body before the schema runs (default `json`). */
  responseType?: "json" | "text"
  /** Budget for the whole call, redirects and body included (default 10 s). */
  timeoutMs?: number
  signal?: AbortSignal
  /**
   * Read a non-2xx body as JSON into the failure's `detail` (for an upstream
   * that documents its errors there). Off by default: the body is cancelled.
   */
  readErrorBody?: boolean
  /** Sees the final response's status and headers (an ETag, 201 against 202) before the body is read. */
  onResponse?: (response: { status: number; headers: Headers }) => void
  /** Read a 4xx body's JSON `message` into the failure: copy the service wrote for people. */
  readErrorMessage?: boolean
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_ERROR_MESSAGE_LENGTH = 200
const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const AUTH_HEADERS = new Set(["x-api-key", "x-goog-api-key", "x-plex-token", "x-emby-token", "authorization"])

class RedirectBlockedError extends Error {
  override name = "RedirectBlockedError"
}

/** `host/path` of a URL, without credentials or query, for logs. */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return "(invalid URL)"
  }
}

/** A copy of the request headers that keeps the caller's spelling. */
function headerRecord(init: HeadersInit | undefined): Record<string, string> {
  if (!init) return {}
  if (init instanceof Headers) return Object.fromEntries(init.entries())
  return Array.isArray(init) ? Object.fromEntries(init) : { ...init }
}

/**
 * `fetch` with `redirect: 'manual'`, following at most three hops by hand.
 * A cross-origin hop drops the custom auth headers for the rest of the chain;
 * a hop to any scheme but http or https, or a fourth hop, throws.
 *
 * Service calls use {@link serviceFetch}; this is the layer under it and
 * under `fetchWithTimeout`.
 */
export async function fetchWithSafeRedirects(url: string, init: RequestInit = {}): Promise<Response> {
  let current = new URL(url)
  let method = (init.method ?? "GET").toUpperCase()
  let body = init.body
  const headers = headerRecord(init.headers)

  for (let hop = 0; ; hop++) {
    const request: RequestInit = { ...init, method, headers, redirect: "manual" }
    if (body == null) delete request.body
    else request.body = body
    const response = await fetch(current.toString(), request)
    const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get("location") : null
    if (!location) return response

    await response.body?.cancel().catch(() => undefined)
    const next = new URL(location, current)
    if (hop >= MAX_REDIRECTS) throw new RedirectBlockedError("Too many redirects")
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new RedirectBlockedError("Redirect to a non-HTTP scheme")
    }
    if (next.origin !== current.origin) {
      for (const key of Object.keys(headers)) if (AUTH_HEADERS.has(key.toLowerCase())) delete headers[key]
    }
    if (response.status === 303 || (method === "POST" && response.status !== 307 && response.status !== 308)) {
      method = "GET"
      body = undefined
      for (const key of Object.keys(headers)) if (key.toLowerCase() === "content-type") delete headers[key]
    }
    current = next
  }
}

function fail(service: string, url: string, code: ServiceErrorCode, status?: number): ServiceFailure {
  const meta = { service, where: describeUrl(url), code, status }
  if (code === "HTTP" && status !== undefined && status < 500) logger.debug(`${service} request failed`, meta)
  else logger.warn(`${service} request failed`, meta)
  return status === undefined ? { ok: false, code } : { ok: false, code, status }
}

/** The JSON body's `message`, cut to 200 characters, or undefined. Never throws. */
async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    if (typeof body !== "object" || body === null || !("message" in body)) return undefined
    const { message } = body
    if (typeof message !== "string" || !message.trim()) return undefined
    return message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
  } catch {
    return undefined
  }
}

/** Log a schema mismatch by issue path only and return `INVALID_RESPONSE`. */
export function invalidResponse(service: string, error: z.ZodError, context: Record<string, unknown> = {}): ServiceFailure {
  logger.warn(`${service} response did not match the expected shape`, {
    service,
    ...context,
    issues: error.issues.slice(0, 10).map((issue) => issue.path.join(".") || "(root)"),
  })
  return { ok: false, code: "INVALID_RESPONSE" }
}

/** One outbound call. Never throws; see the module docs. */
export async function serviceFetch<T>(options: ServiceFetchOptions<T>): Promise<ServiceResult<T>> {
  const { service, url, method = "GET", headers = {}, body, schema, responseType = "json" } = options
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
  const accept: Record<string, string> = responseType === "json" ? { Accept: "application/json" } : {}

  try {
    const response = await fetchWithSafeRedirects(url, { method, headers: { ...accept, ...headers }, body, signal })
    options.onResponse?.({ status: response.status, headers: response.headers })
    if (!response.ok) {
      if (options.readErrorBody) {
        const errorBody: unknown = await response.json().catch(() => undefined)
        return { ...fail(service, url, "HTTP", response.status), detail: { body: errorBody, statusText: response.statusText } }
      }
      const message =
        options.readErrorMessage && response.status >= 400 && response.status < 500
          ? await readErrorMessage(response)
          : undefined
      if (message === undefined) await response.body?.cancel().catch(() => undefined)
      const failure = fail(service, url, "HTTP", response.status)
      return message === undefined ? failure : { ...failure, message }
    }

    let raw: unknown
    try {
      raw = responseType === "json" ? await response.json() : await response.text()
    } catch (error) {
      if (signal.aborted) throw error
      return fail(service, url, "INVALID_RESPONSE")
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) return invalidResponse(service, parsed.error, { where: describeUrl(url) })
    return { ok: true, data: parsed.data }
  } catch (error) {
    if (error instanceof RedirectBlockedError) return fail(service, url, "REDIRECT_BLOCKED")
    if (timeout.aborted) return fail(service, url, "TIMEOUT")
    if (options.signal?.aborted) return fail(service, url, "ABORTED")
    return fail(service, url, "NETWORK")
  }
}

/**
 * A failure worth retrying: a network error, HTTP 429 or a 5xx. A timeout is
 * not, because it has already spent the caller's whole budget.
 */
export function isTransientFailure(failure: ServiceFailure<string>): boolean {
  if (failure.code === "NETWORK") return true
  return failure.code === "HTTP" && failure.status !== undefined && (failure.status === 429 || failure.status >= 500)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resolve()
    }
    signal?.addEventListener("abort", done, { once: true })
  })
}

/**
 * Run `fn` up to `attempts` times while it fails with a result `retryOn`
 * accepts, waiting a jittered, doubling backoff between tries. An aborted
 * `signal` stops the retries and returns the last result.
 */
export async function withRetry<T, C extends string>(
  fn: () => Promise<ServiceResult<T, C>>,
  options: { attempts?: number; retryOn: (failure: ServiceFailure<C>) => boolean; signal?: AbortSignal; baseDelayMs?: number }
): Promise<ServiceResult<T, C>> {
  const { attempts = 3, retryOn, signal, baseDelayMs = 250 } = options
  let result = await fn()
  for (let attempt = 1; attempt < attempts && !result.ok && retryOn(result) && !signal?.aborted; attempt++) {
    const delay = baseDelayMs * 2 ** (attempt - 1)
    await sleep(delay / 2 + Math.random() * (delay / 2), signal)
    if (signal?.aborted) break
    result = await fn()
  }
  return result
}

/** A fixed, key-free message for a failure, built from the service name and status. */
export function serviceErrorMessage(service: string, failure: ServiceFailure<string>): string {
  switch (failure.code) {
    case "TIMEOUT":
      return `${service} did not respond in time`
    case "ABORTED":
      return `${service} request was cancelled`
    case "NETWORK":
      return `Could not reach ${service}`
    case "HTTP":
      return `${service} returned HTTP ${failure.status ?? "error"}`
    case "REDIRECT_BLOCKED":
      return `${service} redirected to an address that is not allowed`
    case "INVALID_RESPONSE":
      return `${service} sent an unexpected response`
    default:
      return `${service} reported an error`
  }
}

/** Adapt a {@link ServiceResult} to the older {@link ConnectionResult} shape. */
export function toConnectionResult<T>(service: string, result: ServiceResult<T, string>): ConnectionResult<T> {
  return result.ok ? { success: true, data: result.data } : { success: false, error: serviceErrorMessage(service, result) }
}
