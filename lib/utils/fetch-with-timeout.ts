/**
 * Fetch utility with timeout support
 *
 * Provides a wrapper around the native fetch API that includes automatic
 * timeout handling via AbortController. This eliminates duplicated
 * timeout/abort logic across connection files.
 *
 * Redirects go through `fetchWithSafeRedirects`, so a cross-origin hop drops
 * the custom auth headers (SEC-36). New service calls use `serviceFetch` from
 * `@/lib/connections/http`, whose timeout always covers the body.
 */

import { fetchWithSafeRedirects } from "@/lib/connections/http"

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default: 10000ms / 10 seconds) */
  timeoutMs?: number
  /**
   * Keep the timeout armed after the headers arrive, so it also bounds reading
   * the body (default: false, the timeout stops once the response starts)
   */
  timeoutCoversBody?: boolean
}

/**
 * Fetch with automatic timeout handling
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including optional timeout
 * @returns The fetch Response object
 * @throws Error with name "AbortError" if timeout is exceeded (with
 *   `timeoutCoversBody`, reading the body rejects the same way)
 *
 * @example
 * ```ts
 * const response = await fetchWithTimeout('https://api.example.com/data', {
 *   method: 'GET',
 *   headers: { 'Accept': 'application/json' },
 *   timeoutMs: 5000, // 5 second timeout
 * })
 * ```
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = 10000, timeoutCoversBody = false, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchWithSafeRedirects(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
    // Left armed, the timer aborts a body read that is still running when it
    // fires; after the body is read, the abort does nothing
    if (!timeoutCoversBody) clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Check if an error is a timeout abort error
 *
 * @param error - The error to check
 * @returns true if the error is an AbortError (timeout)
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}
