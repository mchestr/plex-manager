/**
 * Zod checks for route handlers' dynamic segments and query strings.
 *
 * Each helper returns the parsed value, or a 400 JSON response with
 * `{ error, code: "VALIDATION_ERROR" }` (the code every route already uses)
 * that the handler returns as is.
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

import { NextResponse } from "next/server"
import type { z } from "zod"

import { createSafeError, ErrorCode, getStatusCode } from "@/lib/security/error-handler"

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

function badRequest(error: z.ZodError, headers?: HeadersInit): NextResponse {
  const message = error.issues[0]?.message ?? "Invalid request"
  return NextResponse.json(createSafeError(ErrorCode.VALIDATION_ERROR, message), {
    status: getStatusCode(ErrorCode.VALIDATION_ERROR),
    headers,
  })
}

/** Parses a route's awaited `params`. */
export function parseRouteParams<S extends z.ZodType>(
  schema: S,
  params: unknown,
  headers?: HeadersInit
): Parsed<z.output<S>> {
  const parsed = schema.safeParse(params)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: badRequest(parsed.error, headers) }
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
