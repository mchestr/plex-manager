/**
 * Zod checks for route handlers' dynamic segments, query strings and JSON
 * bodies, the entitlement check for signed-in requests, and the request-id
 * wrapper {@link withRequestContext}.
 *
 * Each parser returns the parsed value, or a 400 JSON response with
 * `{ error, code: "VALIDATION_ERROR" }` (the code every route already uses)
 * that the handler returns as is; {@link parseJsonBody} answers a body over
 * 64 KB with a 413. {@link requireEntitlement} returns a 403 with
 * `code: "NOT_ENTITLED"`, or a redirect to `/subscribe`.
 *
 * @example
 * ```ts
 * const params = parseRouteParams(z.object({ ratingKey: ratingKeySchema }), await context.params)
 * if (!params.ok) return params.response
 * params.data.ratingKey // "123"
 * ```
 *
 * @module lib/actions/route
 */

import "server-only"

import type { Session } from "next-auth"
import { NextResponse } from "next/server"
import type { z } from "zod"

import { hasEntitlement, NOT_ENTITLED_MESSAGE, type Entitlement } from "@/lib/actions/entitlement"
import { isValidRequestId, REQUEST_ID_HEADER } from "@/lib/request-headers"
import { createSafeError, ErrorCode, getStatusCode } from "@/lib/security/error-handler"
import { generateRequestId, runWithRequestContext } from "@/lib/utils/log-context"

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

/**
 * Wraps a route handler so its log lines, and the jobs it enqueues, carry the
 * request id `proxy.ts` forwarded (or a new one when the proxy did not run).
 * Every `route.ts` export goes through it (P11.4).
 */
export function withRequestContext<A extends [Request, ...unknown[]], R>(
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return (...args) => {
    const incoming = args[0].headers.get(REQUEST_ID_HEADER)
    const requestId = isValidRequestId(incoming) ? incoming : generateRequestId()
    return runWithRequestContext(requestId, undefined, () => handler(...args))
  }
}

function refuse(message: string, headers?: HeadersInit, status = getStatusCode(ErrorCode.VALIDATION_ERROR)): NextResponse {
  return NextResponse.json(createSafeError(ErrorCode.VALIDATION_ERROR, message), { status, headers })
}

/** Parses a route's awaited `params`. */
export function parseRouteParams<S extends z.ZodType>(
  schema: S,
  params: unknown,
  headers?: HeadersInit
): Parsed<z.output<S>> {
  const parsed = schema.safeParse(params)
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, response: refuse(parsed.error.issues[0]?.message ?? "Invalid request", headers) }
}

/**
 * Parses a URL's query string. A key that appears more than once keeps its
 * first value, as `URLSearchParams.get` does.
 */
export function parseSearchParams<S extends z.ZodType>(
  schema: S,
  url: URL | string,
  headers?: HeadersInit
): Parsed<z.output<S>> {
  const { searchParams } = typeof url === "string" ? new URL(url) : url
  const values: Record<string, string> = {}
  for (const [key, value] of searchParams) {
    if (!(key in values)) values[key] = value
  }
  return parseRouteParams(schema, values, headers)
}

/** The most bytes {@link parseJsonBody} reads. */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** The body as text, or null above `maxBytes`: by its Content-Length unread, else reading stops there. */
async function readCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > maxBytes) return null
  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      return null
    }
    text += decoder.decode(value, { stream: true })
  }
}

/**
 * Parses a route's JSON body: at most 64 KB is read, and a larger body is a
 * 413. A body that is not JSON, or fails `schema`, is a 400.
 */
export async function parseJsonBody<S extends z.ZodType>(
  schema: S,
  request: Request,
  headers?: HeadersInit
): Promise<Parsed<z.output<S>>> {
  const text = await readCapped(request, MAX_JSON_BODY_BYTES)
  if (text === null) return { ok: false, response: refuse("Request body is too large", headers, 413) }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, response: refuse("Request body is not valid JSON", headers) }
  }
  return parseRouteParams(schema, body, headers)
}

/**
 * Checks that the signed-in `session` meets `required` (see
 * `lib/actions/entitlement.ts`). Refuses with a 403 `NOT_ENTITLED` JSON
 * response, or, for a GET route the browser navigates to, a redirect to
 * `/subscribe` on the origin of `options.redirectFrom`.
 */
export async function requireEntitlement(
  session: Session,
  required: Entitlement,
  options: { redirectFrom?: URL | string; headers?: HeadersInit } = {}
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (await hasEntitlement(session.user.id, required)) {
    return { ok: true }
  }
  if (options.redirectFrom) {
    return { ok: false, response: NextResponse.redirect(new URL("/subscribe", options.redirectFrom)) }
  }
  return {
    ok: false,
    response: NextResponse.json(createSafeError(ErrorCode.NOT_ENTITLED, NOT_ENTITLED_MESSAGE), {
      status: getStatusCode(ErrorCode.NOT_ENTITLED),
      headers: options.headers,
    }),
  }
}
