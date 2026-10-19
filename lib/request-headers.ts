/**
 * Request headers `proxy.ts` sets for the pages it forwards to. The proxy
 * overwrites any value the client sent, so pages may trust them.
 */

/** The request's pathname, for layouts, which Next gives no path (P4.5; P5.1 reads it too). */
export const PATHNAME_HEADER = "x-pm-pathname"
