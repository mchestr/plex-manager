import { z } from "zod"

import { testServiceConnection } from "@/lib/connections/connection-test"
import { serviceErrorMessage, serviceFetch, type ServiceResult } from "@/lib/connections/http"
import {
  prometheusRangeDataSchema,
  prometheusResponseSchema,
  type PrometheusParsed,
  type PrometheusRangeData,
} from "@/lib/validations/prometheus"
import { type ConnectionResult } from "@/types/connection"

/**
 * GET a Prometheus API path; a `status` other than `"success"` is
 * `UPSTREAM_ERROR`.
 */
async function prometheusGet<T>(
  config: PrometheusParsed,
  path: string,
  data: z.ZodType<T>,
  timeoutMs?: number
): Promise<ServiceResult<T | undefined>> {
  const result = await serviceFetch({
    service: "Prometheus",
    url: `${config.url}${path}`,
    schema: prometheusResponseSchema(data),
    timeoutMs,
  })
  if (!result.ok) return result
  if (result.data.status !== "success") return { ok: false, code: "UPSTREAM_ERROR" }
  return { ok: true, data: result.data.data }
}

/**
 * Test connection to Prometheus server
 * Uses the /api/v1/status/buildinfo endpoint which doesn't require authentication
 */
export async function testPrometheusConnection(
  config: PrometheusParsed
): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection("Prometheus", () => prometheusGet(config, "/api/v1/status/buildinfo", z.unknown()))
}

/**
 * Validate that a PromQL query is valid by executing it. Prometheus answers
 * an invalid query with HTTP 400.
 */
export async function validatePrometheusQuery(
  config: PrometheusParsed
): Promise<{ success: boolean; error?: string }> {
  const params = new URLSearchParams({ query: config.query })
  const result = await testServiceConnection("Prometheus", () =>
    prometheusGet(config, `/api/v1/query?${params.toString()}`, z.unknown())
  )
  if (result.success) return result
  return { success: false, error: `Invalid PromQL query: ${result.error}` }
}

/**
 * Query Prometheus for a range of data
 * Used to get historical status data for the status background
 *
 * @param config - Prometheus configuration
 * @param startTime - Start time as Unix timestamp (seconds)
 * @param endTime - End time as Unix timestamp (seconds)
 * @param step - Resolution step (e.g., "1h" for hourly)
 */
export async function queryPrometheusRange(
  config: PrometheusParsed,
  startTime: number,
  endTime: number,
  step: string = "1h"
): Promise<ConnectionResult<PrometheusRangeData>> {
  const params = new URLSearchParams({
    query: config.query,
    start: startTime.toString(),
    end: endTime.toString(),
    step,
  })
  // 30 second budget for range queries
  const result = await prometheusGet(config, `/api/v1/query_range?${params.toString()}`, prometheusRangeDataSchema, 30_000)
  if (!result.ok) return { success: false, error: serviceErrorMessage("Prometheus", result) }
  if (!result.data) return { success: false, error: "No data returned from Prometheus" }
  return { success: true, data: result.data }
}
