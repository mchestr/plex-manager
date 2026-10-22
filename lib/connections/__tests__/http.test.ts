/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/http.ts and connection-test.ts (P2.3: DUP-03,
 * SEC-36, BP-24), against real local HTTP servers so the timeout, the body
 * read and the redirect handling run through Node's own fetch.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { z } from "zod"

import { isConnectionTestBypassed, testServiceConnection } from "@/lib/connections/connection-test"
import {
  serviceErrorMessage,
  serviceFetch,
  withRetry,
  type ServiceResult,
} from "@/lib/connections/http"

type Handler = (req: IncomingMessage, res: ServerResponse) => void

async function startServer(handler: Handler): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  return { server, origin: `http://127.0.0.1:${port}` }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

function redirect(res: ServerResponse, location: string, status = 302) {
  res.writeHead(status, { Location: location })
  res.end()
}

const AUTH = {
  "X-Api-Key": "arr-key",
  "X-Plex-Token": "plex-token",
  "X-Emby-Token": "emby-token",
  Authorization: "Bearer llm-key",
}

const echoSchema = z.object({ method: z.string(), headers: z.record(z.string(), z.unknown()) })

let main: { server: Server; origin: string }
let other: { server: Server; origin: string }
const openResponses = new Set<ServerResponse>()

const echo: Handler = (req, res) => json(res, 200, { method: req.method, headers: req.headers })

beforeAll(async () => {
  other = await startServer(echo)
  main = await startServer((req, res) => {
    const url = new URL(req.url ?? "/", main.origin)
    const hops = /^\/hops\/(\d+)$/.exec(url.pathname)
    if (hops) {
      const left = Number(hops[1])
      return left === 0 ? echo(req, res) : redirect(res, `/hops/${left - 1}`)
    }
    switch (url.pathname) {
      case "/echo":
        return echo(req, res)
      case "/to-other":
        return redirect(res, `${other.origin}/echo`)
      case "/to-file":
        return redirect(res, "file:///etc/passwd")
      case "/see-other":
        return redirect(res, "/echo", 303)
      case "/slow-body":
        // Headers now, then a body that never ends
        openResponses.add(res)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.write('{"partial":')
        return
      case "/status":
        return json(res, Number(url.searchParams.get("code")), { error: "upstream says apikey=SECRET-KEY" })
      case "/not-json":
        res.writeHead(200, { "Content-Type": "application/json" })
        return res.end("<html>SECRET-KEY</html>")
      default:
        return json(res, 200, { value: 1 })
    }
  })
})

afterAll(async () => {
  for (const res of openResponses) res.destroy()
  await Promise.all([main, other].map(({ server }) => new Promise((resolve) => server.close(resolve))))
})

describe("serviceFetch", () => {
  it("matches the module example's message", () => {
    expect(serviceErrorMessage("Sonarr", { ok: false, code: "HTTP", status: 401 })).toBe("Sonarr returned HTTP 401")
  })

  it("returns parsed data on success", async () => {
    const result = await serviceFetch({ service: "Test", url: `${main.origin}/ok`, schema: z.object({ value: z.number() }) })

    expect(result).toEqual({ ok: true, data: { value: 1 } })
  })

  it("aborts a body that never ends at the timeout", async () => {
    const started = Date.now()
    const result = await serviceFetch({
      service: "Test",
      url: `${main.origin}/slow-body`,
      schema: z.unknown(),
      timeoutMs: 300,
    })

    expect(result).toEqual({ ok: false, code: "TIMEOUT" })
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it("returns ABORTED when the caller's signal aborts", async () => {
    const controller = new AbortController()
    const pending = serviceFetch({ service: "Test", url: `${main.origin}/slow-body`, schema: z.unknown(), signal: controller.signal })
    setTimeout(() => controller.abort(), 50)

    expect(await pending).toEqual({ ok: false, code: "ABORTED" })
  })

  it("drops the four auth headers on a cross-origin redirect", async () => {
    const result = await serviceFetch({ service: "Test", url: `${main.origin}/to-other`, headers: AUTH, schema: echoSchema })

    expect(result.ok).toBe(true)
    const headers = result.ok ? result.data.headers : {}
    for (const name of Object.keys(AUTH)) expect(headers).not.toHaveProperty(name.toLowerCase())
    expect(headers).toHaveProperty("accept", "application/json")
  })

  it("keeps the auth headers on a same-origin redirect", async () => {
    const result = await serviceFetch({ service: "Test", url: `${main.origin}/hops/1`, headers: AUTH, schema: echoSchema })

    expect(result.ok).toBe(true)
    const headers = result.ok ? result.data.headers : {}
    for (const [name, value] of Object.entries(AUTH)) expect(headers).toHaveProperty(name.toLowerCase(), value)
  })

  it("follows three hops and refuses a fourth", async () => {
    const three = await serviceFetch({ service: "Test", url: `${main.origin}/hops/3`, schema: echoSchema })
    const four = await serviceFetch({ service: "Test", url: `${main.origin}/hops/4`, schema: echoSchema })

    expect(three.ok).toBe(true)
    expect(four).toEqual({ ok: false, code: "REDIRECT_BLOCKED" })
  })

  it("refuses a redirect to a file: location", async () => {
    const result = await serviceFetch({ service: "Test", url: `${main.origin}/to-file`, schema: z.unknown() })

    expect(result).toEqual({ ok: false, code: "REDIRECT_BLOCKED" })
  })

  it("turns a POST into a GET without a body after a 303", async () => {
    const result = await serviceFetch({
      service: "Test",
      url: `${main.origin}/see-other`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      schema: echoSchema,
    })

    expect(result.ok && result.data.method).toBe("GET")
    expect(result.ok && result.data.headers).not.toHaveProperty("content-type")
  })

  it("returns HTTP with the status, and INVALID_RESPONSE for a body that fails the schema", async () => {
    expect(await serviceFetch({ service: "Test", url: `${main.origin}/status?code=503`, schema: z.unknown() })).toEqual({
      ok: false,
      code: "HTTP",
      status: 503,
    })
    expect(await serviceFetch({ service: "Test", url: `${main.origin}/ok`, schema: z.object({ value: z.string() }) })).toEqual({
      ok: false,
      code: "INVALID_RESPONSE",
    })
  })

  it("keeps a non-2xx body and status text only when asked", async () => {
    const result = await serviceFetch({ service: "Test", url: `${main.origin}/status?code=400`, schema: z.unknown(), readErrorBody: true })

    expect(result).toEqual({
      ok: false,
      code: "HTTP",
      status: 400,
      detail: { body: { error: "upstream says apikey=SECRET-KEY" }, statusText: "Bad Request" },
    })
  })

  it("never puts the key from the URL, the upstream body or an error message in results, messages or logs", async () => {
    const logs = [
      jest.spyOn(console, "warn").mockImplementation(() => undefined),
      jest.spyOn(console, "log").mockImplementation(() => undefined),
      jest.spyOn(console, "debug").mockImplementation(() => undefined),
      jest.spyOn(console, "error").mockImplementation(() => undefined),
    ]
    try {
      const query = "?apikey=SECRET-KEY&X-Plex-Token=SECRET-KEY"
      const results: ServiceResult<unknown>[] = await Promise.all([
        serviceFetch({ service: "Tautulli", url: `${main.origin}/status${query}&code=500`, schema: z.unknown() }),
        serviceFetch({ service: "Tautulli", url: `${main.origin}/status${query}&code=401`, schema: z.unknown() }),
        serviceFetch({ service: "Tautulli", url: `${main.origin}/not-json${query}`, schema: z.unknown() }),
        serviceFetch({ service: "Tautulli", url: `${main.origin}/slow-body${query}`, schema: z.unknown(), timeoutMs: 100 }),
        serviceFetch({ service: "Tautulli", url: `http://127.0.0.1:1/api/v2${query}`, schema: z.unknown() }),
        serviceFetch({ service: "Tautulli", url: `not a url ${query}`, schema: z.unknown() }),
        serviceFetch({ service: "Tautulli", url: `${main.origin}/ok${query}`, schema: z.object({ value: z.string() }) }),
      ])

      expect(results.map((result) => !result.ok && result.code)).toEqual([
        "HTTP",
        "HTTP",
        "INVALID_RESPONSE",
        "TIMEOUT",
        "NETWORK",
        "NETWORK",
        "INVALID_RESPONSE",
      ])
      const messages = results.map((result) => (result.ok ? "" : serviceErrorMessage("Tautulli", result)))
      const output = JSON.stringify({ results, messages, logs: logs.map((spy) => spy.mock.calls) })
      expect(output).not.toContain("SECRET-KEY")
      expect(output.toLowerCase()).not.toContain("apikey")
    } finally {
      for (const spy of logs) spy.mockRestore()
    }
  })
})

describe("withRetry", () => {
  it("retries a failure retryOn accepts, then returns the last result", async () => {
    const fn = jest.fn(async (): Promise<ServiceResult<number>> => ({ ok: false, code: "NETWORK" }))

    const result = await withRetry(fn, { retryOn: () => true, baseDelayMs: 1 })

    expect(fn).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ok: false, code: "NETWORK" })
  })

  it("stops at the first success or a failure retryOn rejects", async () => {
    const fn = jest
      .fn<Promise<ServiceResult<number>>, []>()
      .mockResolvedValueOnce({ ok: false, code: "NETWORK" })
      .mockResolvedValueOnce({ ok: true, data: 7 })

    expect(await withRetry(fn, { retryOn: () => true, baseDelayMs: 1 })).toEqual({ ok: true, data: 7 })
    expect(fn).toHaveBeenCalledTimes(2)

    const http404 = jest.fn(async (): Promise<ServiceResult<number>> => ({ ok: false, code: "HTTP", status: 404 }))
    await withRetry(http404, { retryOn: (failure) => failure.code !== "HTTP", baseDelayMs: 1 })
    expect(http404).toHaveBeenCalledTimes(1)
  })

  it("stops retrying once the signal aborts", async () => {
    const controller = new AbortController()
    const fn = jest.fn(async (): Promise<ServiceResult<number>> => {
      controller.abort()
      return { ok: false, code: "NETWORK" }
    })

    await withRetry(fn, { retryOn: () => true, signal: controller.signal, baseDelayMs: 10_000 })

    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("isConnectionTestBypassed", () => {
  it.each([
    [{ NODE_ENV: "production", SKIP_CONNECTION_TESTS: "true" }, false],
    [{ NODE_ENV: "development", SKIP_CONNECTION_TESTS: "true" }, false],
    [{ NODE_ENV: "production" }, false],
    [{ NODE_ENV: "production", E2E_TEST_MODE: "true" }, false],
    [{ NODE_ENV: "test" }, true],
    // The E2E server: a production build with both test flags
    [{ NODE_ENV: "production", SKIP_CONNECTION_TESTS: "true", E2E_TEST_MODE: "true" }, true],
  ])("%j gives %s", (env, expected) => {
    expect(isConnectionTestBypassed(env)).toBe(expected)
  })

  it("matches the documented example", () => {
    expect(isConnectionTestBypassed({ NODE_ENV: "production", SKIP_CONNECTION_TESTS: "true" })).toBe(false)
    expect(isConnectionTestBypassed({ NODE_ENV: "test" })).toBe(true)
  })
})

describe("testServiceConnection", () => {
  beforeEach(() => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    [{ ok: false, code: "HTTP", status: 401 }, "Invalid API key"],
    [{ ok: false, code: "HTTP", status: 404 }, "Sonarr server not found at this address"],
    [{ ok: false, code: "TIMEOUT" }, "Connection timeout - check your hostname and port"],
    [{ ok: false, code: "NETWORK" }, "Could not reach Sonarr"],
    [{ ok: false, code: "HTTP", status: 502 }, "Sonarr returned HTTP 502"],
  ] as const)("maps %j to a fixed message", async (failure, error) => {
    expect(await testServiceConnection("Sonarr", async () => failure)).toEqual({ success: false, error })
  })

  it("uses the service's own unauthorized message and passes a success through", async () => {
    expect(
      await testServiceConnection("Plex", async () => ({ ok: false, code: "HTTP", status: 401 }), {
        unauthorized: "Invalid Plex token",
      })
    ).toEqual({ success: false, error: "Invalid Plex token" })
    expect(await testServiceConnection("Plex", async () => ({ ok: true, data: null }))).toEqual({ success: true })
  })
})
