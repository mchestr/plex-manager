/**
 * @jest-environment node
 */

import { isMailAddress, parseSmtpUrl, readEmailEnv } from "@/lib/email/env-rules"

describe("parseSmtpUrl", () => {
  it("reads smtp:// with STARTTLS on port 587 by default, and smtps:// on 465", () => {
    expect(parseSmtpUrl("smtp://smtp.example.com")).toEqual({ server: { host: "smtp.example.com", port: 587, secure: false }, hasLogin: false })
    expect(parseSmtpUrl("smtps://smtp.example.com")).toEqual({ server: { host: "smtp.example.com", port: 465, secure: true }, hasLogin: false })
    expect(parseSmtpUrl("smtp://smtp.example.com:2525")?.server.port).toBe(2525)
  })

  it("keeps an IPv6 host without its brackets", () => {
    expect(parseSmtpUrl("smtp://[::1]:2526")?.server).toEqual({ host: "::1", port: 2526, secure: false })
  })

  it("notices a login in the URL", () => {
    expect(parseSmtpUrl("smtp://user:secret@smtp.example.com:587")?.hasLogin).toBe(true)
    expect(parseSmtpUrl("smtp://user@smtp.example.com")?.hasLogin).toBe(true)
  })

  it("refuses another scheme, no host and a value that is not a URL", () => {
    expect(parseSmtpUrl("https://smtp.example.com")).toBeNull()
    expect(parseSmtpUrl("smtp://")).toBeNull()
    expect(parseSmtpUrl("smtp.example.com:587")).toBeNull()
    expect(parseSmtpUrl("not a url")).toBeNull()
  })
})

describe("isMailAddress", () => {
  it("accepts one plain address only", () => {
    expect(isMailAddress("noreply@example.com")).toBe(true)
    expect(isMailAddress("Server <noreply@example.com>")).toBe(false)
    expect(isMailAddress("a@example.com, b@example.com")).toBe(false)
    expect(isMailAddress("plexuser")).toBe(false)
    expect(isMailAddress(`${"a".repeat(250)}@example.com`)).toBe(false)
    expect(isMailAddress("")).toBe(false)
    expect(isMailAddress(null)).toBe(false)
    expect(isMailAddress(undefined)).toBe(false)
  })
})

describe("readEmailEnv", () => {
  const ready = { SMTP_URL: "smtp://smtp.example.com:587", EMAIL_FROM: "noreply@example.com" }

  it("is off without SMTP_URL, whatever else is set", () => {
    expect(readEmailEnv({})).toEqual({ state: "off" })
    expect(readEmailEnv({ SMTP_URL: "  ", EMAIL_FROM: "bad", SMTP_USER: "u" })).toEqual({ state: "off" })
  })

  it("is ready with SMTP_URL and EMAIL_FROM, with no login and no optional values", () => {
    expect(readEmailEnv(ready)).toEqual({
      state: "ready",
      config: {
        server: { host: "smtp.example.com", port: 587, secure: false },
        auth: null,
        from: "noreply@example.com",
        replyTo: null,
        postalAddress: null,
      },
      problems: [],
    })
  })

  it("carries the login, the reply address and the postal address", () => {
    const result = readEmailEnv({
      ...ready,
      SMTP_USER: " smtp-user ",
      SMTP_PASSWORD: "p a s s",
      EMAIL_REPLY_TO: "help@example.com",
      EMAIL_POSTAL_ADDRESS: " 1 Main Street, Springfield ",
    })
    expect(result).toMatchObject({
      state: "ready",
      config: { auth: { user: "smtp-user", pass: "p a s s" }, replyTo: "help@example.com", postalAddress: "1 Main Street, Springfield" },
    })
  })

  it("ignores a login in the URL with a warning that does not block", () => {
    const result = readEmailEnv({ ...ready, SMTP_URL: "smtp://user:secret@smtp.example.com:587" })
    expect(result.state).toBe("ready")
    expect(result.state === "ready" && result.config.auth).toBeNull()
    expect(result.state === "ready" && result.problems).toEqual([
      expect.objectContaining({ variable: "SMTP_URL", code: "invalid", blocking: false, hint: expect.stringContaining("SMTP_USER and SMTP_PASSWORD") }),
    ])
  })

  it.each([
    [{ SMTP_URL: "smtp://smtp.example.com" }, "EMAIL_FROM", "missing"],
    [{ ...ready, SMTP_URL: "http://smtp.example.com" }, "SMTP_URL", "invalid"],
    [{ ...ready, EMAIL_FROM: "Server <noreply@example.com>" }, "EMAIL_FROM", "invalid"],
    [{ ...ready, EMAIL_REPLY_TO: "help" }, "EMAIL_REPLY_TO", "invalid"],
    [{ ...ready, SMTP_USER: "smtp-user" }, "SMTP_PASSWORD", "missing"],
    [{ ...ready, SMTP_PASSWORD: "secret" }, "SMTP_USER", "missing"],
  ])("blocks sending for %j: %s %s", (env, variable, code) => {
    expect(readEmailEnv(env)).toEqual({ state: "invalid", problems: [expect.objectContaining({ variable, code, blocking: true })] })
  })

  it("never puts a value in a hint", () => {
    const result = readEmailEnv({ SMTP_URL: "smtp://user:hunter2@smtp.example.com", EMAIL_FROM: "x-from", SMTP_USER: "smtp-login" })
    expect(JSON.stringify(result)).not.toMatch(/hunter2|x-from|smtp-login/)
  })
})
