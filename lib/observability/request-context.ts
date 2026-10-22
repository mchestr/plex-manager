/**
 * The request id `proxy.ts` forwards as `x-request-id` (BP-17), for Server
 * Components, actions and route handlers.
 *
 * @module lib/observability/request-context
 */

import "server-only"

import { headers } from "next/headers"
import { cache } from "react"

import { isValidRequestId, REQUEST_ID_HEADER } from "@/lib/request-headers"

/**
 * This request's id, or null outside a request (a job, a script, a test) or
 * when the proxy did not run. Cached for the render. A Server Component that
 * logs passes `{ requestId: await getRequestId() }` itself.
 */
export const getRequestId = cache(async (): Promise<string | null> => {
  try {
    const id = (await headers()).get(REQUEST_ID_HEADER)
    return isValidRequestId(id) ? id : null
  } catch {
    return null
  }
})
