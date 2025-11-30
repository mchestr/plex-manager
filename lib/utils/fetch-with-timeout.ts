/**
 * Fetch utility with timeout support
 *
 * Provides a wrapper around the native fetch API that includes automatic
 * timeout handling via AbortController. This eliminates duplicated
 * timeout/abort logic across connection files.
 */

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default: 10000ms / 10 seconds) */
  timeoutMs?: number
}

/**
 * Fetch with automatic timeout handling
 *
 * @param url - The URL to fetch
 * @param options - Fetch options including optional timeout
 * @returns The fetch Response object
 * @throws Error with name "AbortError" if timeout is exceeded
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
  const { timeoutMs = 10000, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
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
