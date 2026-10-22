import { z } from "zod"

import { testServiceConnection } from "@/lib/connections/connection-test"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

/**
 * Shared HTTP helpers for the Sonarr and Radarr v3 API clients.
 *
 * Sonarr and Radarr expose structurally identical REST APIs (same auth header,
 * same `/api/v3/...` shape, same JSON envelope), so both clients call through
 * here and `serviceFetch` supplies the timeout, safe redirects and key-free
 * errors.
 */

interface ArrConfig {
  url: string
  apiKey: string
}

type ArrService = "Sonarr" | "Radarr"

/**
 * GET an *arr v3 endpoint as a {@link ConnectionResult}.
 *
 * @param service - "Sonarr" or "Radarr", for messages and logs.
 * @param config - Server URL + API key.
 * @param path - Path beginning with `/` (e.g. `/api/v3/queue`), already URL-encoded.
 */
export async function arrGet(service: ArrService, config: ArrConfig, path: string): Promise<ConnectionResult<unknown>> {
  const result = await serviceFetch({
    service,
    url: `${config.url}${path}`,
    headers: { "X-Api-Key": config.apiKey },
    schema: z.unknown(),
  })
  return toConnectionResult(service, result)
}

/** The setup forms' connection test: `/api/v3/system/status` must answer with an object. */
export async function testArrConnection(service: ArrService, config: ArrConfig): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection(service, () =>
    serviceFetch({
      service,
      url: `${config.url}/api/v3/system/status`,
      headers: { "X-Api-Key": config.apiKey },
      schema: z.looseObject({}),
    })
  )
}

type QueryValue = string | number | boolean

/**
 * A query string from parameters an endpoint's schema accepts. Each endpoint
 * has a strict schema of the parameters its controller binds, so a parameter
 * it would silently ignore (such as `seriesId` on `/api/v3/history`) is a type
 * error (GAP-07). `null` when the values fail the schema.
 */
export function arrQuery<S extends z.ZodType<Record<string, QueryValue | undefined>>>(schema: S, params: z.input<S>): string | null {
  const parsed = schema.safeParse(params)
  if (!parsed.success) return null
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) query.append(key, String(value))
  }
  return query.toString()
}

/** `PagingResource`: one page of `records` and the total across every page. */
const pagingSchema = z.looseObject({
  page: z.number(),
  pageSize: z.number(),
  totalRecords: z.number(),
  records: z.array(z.unknown()),
})

/** Records read across pages, and the total the server reports. */
export interface ArrPage {
  records: unknown[]
  totalRecords: number
}

/** Most pages and records {@link arrGetPaged} reads for one call. */
const ARR_MAX_PAGES = 3
export const ARR_MAX_RECORDS = 150
const ARR_PAGE_SIZE = 50

/** `limit` as a whole number from 1 to {@link ARR_MAX_RECORDS}. */
function arrLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit) || 1, 1), ARR_MAX_RECORDS)
}

/** A `{ success: false }` for parameters that failed an endpoint's schema. */
export function invalidArrParams(service: ArrService): ConnectionResult<never> {
  return { success: false, error: `Invalid ${service} request parameters` }
}

/**
 * GET a paged *arr endpoint, following `page` until it has `limit` records,
 * the server's `totalRecords`, an empty page or three pages, whichever comes
 * first. `limit` is capped at {@link ARR_MAX_RECORDS}; a page asks for at most 50.
 *
 * @param query - From {@link arrQuery}, without `page` or `pageSize`.
 */
export async function arrGetPaged(
  service: ArrService,
  config: ArrConfig,
  path: string,
  query: string | null,
  limit: number
): Promise<ConnectionResult<ArrPage>> {
  if (query === null) return invalidArrParams(service)
  const wanted = arrLimit(limit)
  const pageSize = Math.min(wanted, ARR_PAGE_SIZE)
  const records: unknown[] = []
  let totalRecords = 0
  for (let page = 1; page <= ARR_MAX_PAGES; page++) {
    const result = await serviceFetch({
      service,
      url: `${config.url}${path}?${query ? `${query}&` : ""}page=${page}&pageSize=${pageSize}`,
      headers: { "X-Api-Key": config.apiKey },
      schema: pagingSchema,
    })
    if (!result.ok) return toConnectionResult(service, result)
    totalRecords = result.data.totalRecords
    records.push(...result.data.records)
    if (result.data.records.length === 0 || records.length >= wanted || records.length >= totalRecords) break
  }
  return { success: true, data: { records: records.slice(0, wanted), totalRecords } }
}

/**
 * GET an unpaged *arr list (such as `/api/v3/history/series`) as an
 * {@link ArrPage}: the first `limit` records and the full count.
 */
export async function arrGetList(
  service: ArrService,
  config: ArrConfig,
  path: string,
  query: string | null,
  limit: number
): Promise<ConnectionResult<ArrPage>> {
  if (query === null) return invalidArrParams(service)
  const result = await serviceFetch({
    service,
    url: `${config.url}${path}${query ? `?${query}` : ""}`,
    headers: { "X-Api-Key": config.apiKey },
    schema: z.array(z.unknown()),
  })
  if (!result.ok) return toConnectionResult(service, result)
  return { success: true, data: { records: result.data.slice(0, arrLimit(limit)), totalRecords: result.data.length } }
}
