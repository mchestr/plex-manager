/**
 * Request headers `proxy.ts` sets for the pages it forwards to. The proxy
 * overwrites any value the client sent, so pages may trust them.
 */

/** The request's pathname, for layouts, which Next gives no path (P4.5; P5.1 reads it too). */
export const PATHNAME_HEADER = "x-pm-pathname"

/**
 * The request id (BP-17, P11.4): a reverse proxy's value when it is
 * {@link isValidRequestId}, otherwise one the proxy generates. Also set on the
 * response as `X-Request-ID`.
 */
export const REQUEST_ID_HEADER = "x-request-id"

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/

/** Whether an incoming id is safe to keep: it reaches every log line. */
export function isValidRequestId(id: string | null | undefined): id is string {
  return typeof id === "string" && VALID_REQUEST_ID.test(id)
}
