/**
 * The `onRequestError` hook `instrumentation.ts` exports (BP-17, P11.4): one
 * `request.unhandled_error` line per error Next could not handle, with the
 * digest the error page shows (P10.17), so an admin can find the line.
 *
 * The path is the pathname alone, with share and invite tokens masked
 * (`sanitizeText`); the query never reaches the log.
 *
 * @module lib/instrumentation/on-request-error
 */

import type { Instrumentation } from "next"

import { isValidRequestId, REQUEST_ID_HEADER } from "@/lib/request-headers"
import { sanitizeText } from "@/lib/utils/log-redaction"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("instrumentation")

function digestOf(error: unknown): string | undefined {
  const digest = typeof error === "object" && error !== null ? (error as { digest?: unknown }).digest : undefined
  return typeof digest === "string" ? digest : undefined
}

function requestIdOf(headers: NodeJS.Dict<string | string[]>): string | undefined {
  const value = headers[REQUEST_ID_HEADER]
  const id = Array.isArray(value) ? value[0] : value
  return isValidRequestId(id) ? id : undefined
}

export const logUnhandledRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logger.error("request.unhandled_error", error, {
    digest: digestOf(error),
    method: request.method,
    path: sanitizeText(request.path.split("?")[0] ?? ""),
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    requestId: requestIdOf(request.headers),
  })
}
