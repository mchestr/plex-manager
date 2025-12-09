import {
  type PrometheusParsed,
  type PrometheusApiResponse,
  type PrometheusRangeData,
} from "@/lib/validations/prometheus"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
import { type ConnectionResult } from "@/types/connection"

/**
 * Test connection to Prometheus server
 * Uses the /api/v1/status/buildinfo endpoint which doesn't require authentication
 */
export async function testPrometheusConnection(
  config: PrometheusParsed
): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.SKIP_CONNECTION_TESTS === "true"
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/api/v1/status/buildinfo`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Prometheus server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = (await response.json()) as PrometheusApiResponse<unknown>

    if (data.status !== "success") {
      return { success: false, error: data.error || "Prometheus API error" }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Prometheus server" }
  }
}

/**
 * Validate that a PromQL query is valid by executing it
 */
export async function validatePrometheusQuery(
  config: PrometheusParsed
): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS
  const isTestMode =
    process.env.NODE_ENV === "test" || process.env.SKIP_CONNECTION_TESTS === "true"
  if (isTestMode) {
    return { success: true }
  }

  try {
    const params = new URLSearchParams({
      query: config.query,
    })
    const url = `${config.url}/api/v1/query?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    })

    if (!response.ok) {
      return { success: false, error: `Query validation failed: ${response.statusText}` }
    }

    const data = (await response.json()) as PrometheusApiResponse<unknown>

    if (data.status !== "success") {
      return {
        success: false,
        error: data.error || "Invalid PromQL query",
      }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Query validation timeout" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Query validation error: ${error.message}` }
    }
    return { success: false, error: "Failed to validate query" }
  }
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
  try {
    const params = new URLSearchParams({
      query: config.query,
      start: startTime.toString(),
      end: endTime.toString(),
      step,
    })
    const url = `${config.url}/api/v1/query_range?${params.toString()}`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      timeoutMs: 30000, // 30 second timeout for range queries
    })

    if (!response.ok) {
      return { success: false, error: `Prometheus query error: ${response.statusText}` }
    }

    const data = (await response.json()) as PrometheusApiResponse<PrometheusRangeData>

    if (data.status !== "success") {
      return { success: false, error: data.error || "Prometheus query failed" }
    }

    if (!data.data) {
      return { success: false, error: "No data returned from Prometheus" }
    }

    return { success: true, data: data.data }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Query timeout - try a shorter time range" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Query error: ${error.message}` }
    }
    return { success: false, error: "Failed to query Prometheus" }
  }
}
