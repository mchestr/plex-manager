/**
 * The Prometheus client reports Prometheus's own error body (GAP-09):
 * `errorType: error` on a 4xx/5xx, a retryable timeout on 503, and the
 * status text when the body is not JSON.
 */

import badData from "./fixtures/prometheus/400-bad-data.json"
import execution from "./fixtures/prometheus/422-execution.json"
import timeout from "./fixtures/prometheus/503-timeout.json"
import { queryPrometheusRange, validatePrometheusQuery } from "@/lib/connections/prometheus"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const config = { name: "Prometheus", url: "http://prom.lan:9090", query: "rate(" }
const mockFetch = jest.fn()

function respond(status: number, statusText: string, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Headers(),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

describe("validatePrometheusQuery", () => {
  beforeEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
  })

  it("returns errorType: error from a 400 body", async () => {
    mockFetch.mockResolvedValue(respond(400, "Bad Request", badData))

    expect(await validatePrometheusQuery(config)).toEqual({
      success: false,
      code: "PROMETHEUS_ERROR",
      errorType: "bad_data",
      error: "bad_data: parse error at char 5",
      retryable: false,
    })
    expect(String(mockFetch.mock.calls[0][0])).toBe("http://prom.lan:9090/api/v1/query?query=rate%28")
  })

  it("returns a 422 execution error, not retryable", async () => {
    mockFetch.mockResolvedValue(respond(422, "Unprocessable Entity", execution))

    expect(await validatePrometheusQuery(config)).toMatchObject({
      code: "PROMETHEUS_ERROR",
      error: `execution: ${execution.error}`,
      retryable: false,
    })
  })

  it("cuts a long message to 300 characters", async () => {
    mockFetch.mockResolvedValue(respond(400, "Bad Request", { ...badData, error: "x".repeat(1000) }))

    const result = await validatePrometheusQuery(config)

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toHaveLength(300)
  })

  it("passes a query Prometheus accepts", async () => {
    mockFetch.mockResolvedValue(respond(200, "OK", { status: "success", data: { resultType: "vector", result: [] } }))

    expect(await validatePrometheusQuery(config)).toEqual({ success: true, data: null })
  })
})

describe("queryPrometheusRange", () => {
  it("treats a 503 as a retryable timeout", async () => {
    mockFetch.mockResolvedValue(respond(503, "Service Unavailable", timeout))

    expect(await queryPrometheusRange(config, 0, 3600)).toEqual({
      success: false,
      code: "PROMETHEUS_TIMEOUT",
      errorType: "timeout",
      error: "timeout: query timed out in expression evaluation",
      retryable: true,
    })
  })

  it("falls back to the status text for an HTML body", async () => {
    mockFetch.mockResolvedValue(respond(502, "Bad Gateway", "<html>nginx</html>"))

    expect(await queryPrometheusRange(config, 0, 3600)).toEqual({
      success: false,
      code: "PROMETHEUS_ERROR",
      error: "Bad Gateway",
      retryable: false,
    })
  })

  it("returns the range data on success", async () => {
    const data = { resultType: "matrix", result: [{ metric: { job: "plex" }, values: [[0, "1"]] }] }
    mockFetch.mockResolvedValue(respond(200, "OK", { status: "success", data }))

    expect(await queryPrometheusRange(config, 0, 3600)).toEqual({ success: true, data })
  })
})
