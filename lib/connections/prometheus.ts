import { z } from "zod"

import { isConnectionTestBypassed, testServiceConnection } from "@/lib/connections/connection-test"
import { serviceErrorMessage, serviceFetch, type ServiceFailure, type ServiceResult } from "@/lib/connections/http"
import {
  prometheusErrorBodySchema,
  prometheusRangeDataSchema,
  prometheusResponseSchema,
  type PrometheusParsed,
  type PrometheusRangeData,
} from "@/lib/validations/prometheus"

/** The longest Prometheus error message passed on. */
const ERROR_MAX = 300

/**
 * A failed Prometheus call. `error` is Prometheus's own `errorType: error`
 * when it sent one (cut to 300 characters), else the HTTP status text or a
 * fixed message. A 503 (a query timeout or abort) is `PROMETHEUS_TIMEOUT`
 * and `retryable`.
 */
export interface PrometheusFailure {
  success: false
  code: "PROMETHEUS_ERROR" | "PROMETHEUS_TIMEOUT"
  error: string
  errorType?: string
  retryable: boolean
}

export type PrometheusResult<T> = { success: true; data: T } | PrometheusFailure

/** GET a Prometheus API path, keeping a non-2xx body for {@link prometheusFailure}. */
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
    readErrorBody: true,
  })
  return result.ok ? { ok: true, data: result.data.data } : result
}

/** A failure as {@link PrometheusFailure}, from Prometheus's documented error body when there is one. */
function prometheusFailure(failure: ServiceFailure): PrometheusFailure {
  const timedOut = failure.code === "HTTP" && failure.status === 503
  const base = { success: false, code: timedOut ? "PROMETHEUS_TIMEOUT" : "PROMETHEUS_ERROR", retryable: timedOut } as const
  const body = prometheusErrorBodySchema.safeParse(failure.detail?.body)
  if (body.success) {
    const { errorType, error } = body.data
    return { ...base, errorType, error: `${errorType}: ${error}`.slice(0, ERROR_MAX) }
  }
  if (failure.detail?.statusText) return { ...base, error: failure.detail.statusText }
  return { ...base, error: serviceErrorMessage("Prometheus", failure) }
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
 * Validate a PromQL query by running it. An invalid query fails with
 * Prometheus's own message, e.g. "bad_data: parse error at char 5: ...".
 */
export async function validatePrometheusQuery(
  config: PrometheusParsed,
  { timeoutMs }: { timeoutMs?: number } = {}
): Promise<PrometheusResult<null>> {
  if (isConnectionTestBypassed()) return { success: true, data: null }
  const params = new URLSearchParams({ query: config.query })
  const result = await prometheusGet(config, `/api/v1/query?${params.toString()}`, z.unknown(), timeoutMs)
  return result.ok ? { success: true, data: null } : prometheusFailure(result)
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
): Promise<PrometheusResult<PrometheusRangeData>> {
  const params = new URLSearchParams({
    query: config.query,
    start: startTime.toString(),
    end: endTime.toString(),
    step,
  })
  // 30 second budget for range queries
  const result = await prometheusGet(config, `/api/v1/query_range?${params.toString()}`, prometheusRangeDataSchema, 30_000)
  if (!result.ok) return prometheusFailure(result)
  if (!result.data) return { success: false, code: "PROMETHEUS_ERROR", error: "No data returned from Prometheus", retryable: false }
  return { success: true, data: result.data }
}
