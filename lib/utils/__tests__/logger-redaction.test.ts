/**
 * @jest-environment node
 */

/**
 * What the production logger prints (SEC-54): every rule in `REDACT_RULES`,
 * applied to metadata and to message strings, and Errors with their stack.
 */

import { captureProductionLogs } from "@/__tests__/helpers/log-capture"
import { REDACT_RULES } from "@/lib/utils/log-redaction"

const SECRET = "Sup3rSecretValue"

const { createLogger, lines } = captureProductionLogs()
const logger = createLogger("redaction-test")

/** The one JSON line `log` writes, as text, and parsed. */
function printed(log: () => void) {
  lines.length = 0
  log()
  expect(lines).toHaveLength(1)
  return { text: JSON.stringify(lines[0]), line: lines[0] }
}

describe("query keys", () => {
  it.each(REDACT_RULES.queryKeys)("masks %s= in a URL value and in the message", (key) => {
    const url = `https://plex.example.com/path?year=2026&${key}=${SECRET}`
    const { text, line } = printed(() => logger.info(`Fetching ${url}`, { url }))

    expect(text).not.toContain(SECRET)
    expect(line.message).toBe(`Fetching https://plex.example.com/path?year=2026&${key}=[REDACTED]`)
    expect(line.metadata?.url).toBe(`https://plex.example.com/path?year=2026&${key}=[REDACTED]`)
  })

  it("matches keys case-insensitively", () => {
    const { text } = printed(() => logger.info("x", { url: `/callback?CODE=${SECRET}&State=${SECRET}` }))
    expect(text).not.toContain(SECRET)
  })

  it("masks ?code=...&state=... and keeps the other keys", () => {
    const { line } = printed(() =>
      logger.info("Discord callback", { url: `/api/discord/callback?code=${SECRET}&state=${SECRET}&tab=1` })
    )
    expect(line.metadata?.url).toBe("/api/discord/callback?code=[REDACTED]&state=[REDACTED]&tab=1")
  })

  it("masks X-Plex-Token= in a URL and inside a message string", () => {
    const { text, line } = printed(() =>
      logger.warn(`Plex said no for /library/sections?X-Plex-Token=${SECRET} (apikey=${SECRET})`, {
        url: `http://plex:32400/status/sessions?X-Plex-Token=${SECRET}`,
      })
    )
    expect(text).not.toContain(SECRET)
    expect(line.message).toBe(
      "Plex said no for /library/sections?X-Plex-Token=[REDACTED] (apikey=[REDACTED])"
    )
  })

  it("masks credentials in a URL", () => {
    const { text } = printed(() => logger.info(`Connecting to https://admin:${SECRET}@db.example.com/x`))
    expect(text).not.toContain(SECRET)
  })
})

describe("bearer paths", () => {
  it.each(REDACT_RULES.bearerPaths)("masks the segment after %s and keeps the rest", (prefix) => {
    const path = `${prefix}${SECRET}/story?size=og`
    const { text, line } = printed(() => logger.info(`GET ${path}`, { pathname: path }))

    expect(text).not.toContain(SECRET)
    expect(line.message).toBe(`GET ${prefix}[masked]/story?size=og`)
    expect(line.metadata?.pathname).toBe(`${prefix}[masked]/story?size=og`)
  })

  it.each([
    ["/rewind/s/Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8", "/rewind/s/[masked]"],
    ["/wrapped/share/Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8", "/wrapped/share/[masked]"],
    ["/api/wrapped/share/Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8", "/api/wrapped/share/[masked]"],
    ["/api/rewind/card/s/assetKey123/3", "/api/rewind/card/s/[masked]/3"],
    ["/rewind/2026?s=assetKey123", "/rewind/2026?s=[REDACTED]"],
    ["/invite/ABCD2345", "/invite/[masked]"],
  ])("prints %s as %s", (path, expected) => {
    expect(printed(() => logger.info("Request", { path })).line.metadata?.path).toBe(expected)
  })

  it("leaves paths that only look alike", () => {
    const { line } = printed(() => logger.info("Request", { path: "/admin/invites/new" }))
    expect(line.metadata?.path).toBe("/admin/invites/new")
  })
})

describe("fields and values", () => {
  it.each([
    ["state", SECRET],
    ["pinId", "123456"],
    ["plexPinId", 123456],
    ["inviteCode", "ABCD2345"],
    ["assetKey", "abc"],
    ["shareToken", SECRET],
    ["apiKey", SECRET],
    ["password", SECRET],
  ])("redacts the %s field", (key, value) => {
    expect(printed(() => logger.info("x", { [key]: value })).line.metadata?.[key]).toBe("[REDACTED]")
  })

  it("keeps booleans under sensitive keys, and numbers under a substring match", () => {
    const { line } = printed(() => logger.info("x", { hasToken: true, inputTokens: 1200 }))
    expect(line.metadata).toEqual({ hasToken: true, inputTokens: 1200 })
  })

  it("masks an email anywhere", () => {
    const { text } = printed(() => logger.info("Invite sent to member@example.com", { to: "member@example.com" }))
    expect(text).not.toContain("member@example.com")
  })

  it.each([
    ["ip", "203.0.113.7", "203.0.113.0/24"],
    ["clientIp", "2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3::/48"],
    ["clientIp", "2001:db8::1", "2001:db8:0::/48"],
    ["ip", "::ffff:198.51.100.23", "198.51.100.0/24"],
    ["x-forwarded-for", "10.0.0.1, 203.0.113.7", "10.0.0.0/24, 203.0.113.0/24"],
    ["ip", "unknown", "[masked]"],
  ])("prints the %s %s as %s", (key, ip, expected) => {
    const { text, line } = printed(() => logger.info("x", { [key]: ip }))
    expect(line.metadata?.[key]).toBe(expected)
    expect(text).not.toContain(ip)
  })

  it("passes a UUID request id unchanged", () => {
    const requestId = "6f1c2e8a-4b7d-4c3e-9a2f-1d5e8b7c6a90"
    expect(printed(() => logger.info("x", { requestId })).line.metadata?.requestId).toBe(requestId)
  })

  it("prints a circular value once", () => {
    const value: Record<string, unknown> = { name: "loop" }
    value.self = value
    expect(printed(() => logger.info("x", { value })).line.metadata?.value).toEqual({
      name: "loop",
      self: "[Circular]",
    })
  })
})

describe("errors", () => {
  it("prints { error: new Error('boom') } with its name, message and stack", () => {
    const error = new Error("boom")
    const printedError = printed(() => logger.warn("Failed", { error })).line.metadata?.error

    expect(printedError).toEqual({ name: "Error", message: "boom", stack: error.stack })
    expect(error.stack).toContain("logger-redaction.test.ts")
  })

  it("prints a nested cause and the error code", () => {
    const cause = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" })
    const error = new TypeError("fetch failed", { cause })
    const printedError = printed(() => logger.warn("Failed", { context: { error } })).line.metadata

    expect(printedError).toEqual({
      context: {
        error: {
          name: "TypeError",
          message: "fetch failed",
          stack: error.stack,
          cause: { name: "Error", message: "connection refused", code: "ECONNREFUSED", stack: cause.stack },
        },
      },
    })
  })

  it("keeps the stack of logger.error(message, error) in production", () => {
    const error = new Error(`Request to /invite/${SECRET} failed`)
    const { text, line } = printed(() => logger.error("Redeem failed", error, { attempt: 1 }))

    expect(line.level).toBe("error")
    expect(line.metadata).toEqual({
      attempt: 1,
      err: {
        name: "Error",
        message: "Request to /invite/[masked] failed",
        stack: expect.stringContaining("Request to /invite/[masked] failed"),
      },
    })
    expect(text).not.toContain(SECRET)
  })
})
