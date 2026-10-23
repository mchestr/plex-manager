import { z } from "zod"

import { createServerUrlSchema } from "./shared-schemas"

export const prometheusSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  url: createServerUrlSchema("9090"),
  query: z.string().min(1, "PromQL query is required"),
})

export type PrometheusParsed = z.output<typeof prometheusSchema>

/**
 * Prometheus API response schemas
 * Based on Prometheus HTTP API: https://prometheus.io/docs/prometheus/latest/querying/api/
 */

/** The `{ status, data }` wrapper of a 2xx Prometheus API response; its status is always "success". */
export function prometheusResponseSchema<T extends z.ZodType>(data: T) {
  return z.looseObject({
    status: z.literal("success"),
    data: data.optional(),
  })
}

/** The body of a 4xx/5xx answer: 400 bad parameters, 422 an expression that cannot run, 503 a timeout or abort. */
export const prometheusErrorBodySchema = z.looseObject({
  status: z.literal("error"),
  errorType: z.string(),
  error: z.string(),
})

/** `query_range` data: one series per metric, as `[timestamp, value]` pairs. */
export const prometheusRangeDataSchema = z.looseObject({
  resultType: z.enum(["matrix", "vector", "scalar", "string"]),
  result: z.array(
    z.looseObject({
      metric: z.record(z.string(), z.string()),
      values: z.array(z.tuple([z.number(), z.string()])),
    })
  ),
})

export type PrometheusRangeData = z.infer<typeof prometheusRangeDataSchema>
