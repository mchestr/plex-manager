import { z } from "zod"

import { createServerUrlSchema } from "./shared-schemas"

export const prometheusSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  url: createServerUrlSchema("9090"),
  query: z.string().min(1, "PromQL query is required"),
})

export type PrometheusInput = z.input<typeof prometheusSchema>
export type PrometheusParsed = z.output<typeof prometheusSchema>

/**
 * Prometheus API response types
 * Based on Prometheus HTTP API: https://prometheus.io/docs/prometheus/latest/querying/api/
 */

/**
 * Prometheus API response wrapper
 */
export interface PrometheusApiResponse<T> {
  status: "success" | "error"
  data?: T
  errorType?: string
  error?: string
}

/**
 * Prometheus query_range result data
 */
export interface PrometheusRangeData {
  resultType: "matrix" | "vector" | "scalar" | "string"
  result: PrometheusRangeResult[]
}

/**
 * Prometheus range query result (matrix type)
 */
export interface PrometheusRangeResult {
  metric: Record<string, string>
  values: Array<[number, string]> // [timestamp, value]
}

/**
 * Prometheus instant query result (vector type)
 */
export interface PrometheusInstantResult {
  metric: Record<string, string>
  value: [number, string] // [timestamp, value]
}
