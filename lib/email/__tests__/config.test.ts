/**
 * @jest-environment node
 */

import { emailConfigured, emailStatus, getEmailConfig, smtpSecurity } from "@/lib/email/config"
import type { EmailConfig } from "@/lib/email/env-rules"

const MAIL_VARIABLES = ["SMTP_URL", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM", "EMAIL_REPLY_TO", "EMAIL_POSTAL_ADDRESS"] as const

function setEnv(values: Partial<Record<(typeof MAIL_VARIABLES)[number], string>>) {
  for (const name of MAIL_VARIABLES) {
    const value = values[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

afterEach(() => setEnv({}))

describe("emailConfigured", () => {
  it("is true only with SMTP_URL and EMAIL_FROM set and usable", () => {
    setEnv({})
    expect(emailConfigured()).toBe(false)
    setEnv({ SMTP_URL: "smtp://smtp.example.com:587" })
    expect(emailConfigured()).toBe(false)
    setEnv({ EMAIL_FROM: "noreply@example.com" })
    expect(emailConfigured()).toBe(false)
    setEnv({ SMTP_URL: "smtp://smtp.example.com:587", EMAIL_FROM: "noreply@example.com" })
    expect(emailConfigured()).toBe(true)
    setEnv({ SMTP_URL: "smtp://smtp.example.com:587", EMAIL_FROM: "noreply@example.com", SMTP_USER: "u" })
    expect(emailConfigured()).toBe(false)
  })

  it("gives the transport the login", () => {
    setEnv({ SMTP_URL: "smtp://smtp.example.com", EMAIL_FROM: "noreply@example.com", SMTP_USER: "u", SMTP_PASSWORD: "p" })
    expect(getEmailConfig()?.auth).toEqual({ user: "u", pass: "p" })
  })
})

describe("smtpSecurity", () => {
  const config = (secure: boolean, auth: EmailConfig["auth"]): EmailConfig => ({
    server: { host: "smtp.example.com", port: 587, secure },
    auth,
    from: "noreply@example.com",
    replyTo: null,
    postalAddress: null,
  })

  it("is TLS for smtps://, and STARTTLS required only with a login", () => {
    expect(smtpSecurity(config(true, null))).toBe("tls")
    expect(smtpSecurity(config(false, null))).toBe("starttls")
    expect(smtpSecurity(config(false, { user: "u", pass: "p" }))).toBe("starttls_required")
  })
})

describe("emailStatus", () => {
  it("is off without SMTP_URL", () => {
    expect(emailStatus()).toEqual({ state: "off" })
  })

  it("names the variables to fix", () => {
    setEnv({ SMTP_URL: "smtp://smtp.example.com" })
    expect(emailStatus()).toEqual({ state: "invalid", problems: [{ variable: "EMAIL_FROM", code: "missing", hint: expect.any(String) }], warnings: [] })
  })

  it("keeps the problems that stop email apart from the ones that do not", () => {
    setEnv({ SMTP_URL: "smtp://url-login@smtp.example.com" })
    expect(emailStatus()).toEqual({
      state: "invalid",
      problems: [{ variable: "EMAIL_FROM", code: "missing", hint: expect.any(String) }],
      warnings: [{ variable: "SMTP_URL", code: "invalid", hint: expect.stringContaining("ignored") }],
    })
  })

  it("shows the host, the port, the security and the sender, never the login or the postal address", () => {
    setEnv({
      SMTP_URL: "smtp://smtp.example.com:587",
      EMAIL_FROM: "noreply@example.com",
      EMAIL_REPLY_TO: "help@example.com",
      SMTP_USER: "smtp-login-name",
      SMTP_PASSWORD: "smtp-password-value",
      EMAIL_POSTAL_ADDRESS: "1 Main Street",
    })
    const status = emailStatus()

    expect(status).toEqual({
      state: "ready",
      warnings: [],
      host: "smtp.example.com",
      port: 587,
      security: "starttls_required",
      from: "noreply@example.com",
      replyTo: "help@example.com",
      hasLogin: true,
      hasPostalAddress: true,
    })
    expect(JSON.stringify(status)).not.toMatch(/smtp-login-name|smtp-password-value|Main Street/)
  })

  it("keeps a problem that does not stop email as a warning, with no value from the URL", () => {
    setEnv({ SMTP_URL: "smtp://url-login:url-password@smtp.example.com:587", EMAIL_FROM: "noreply@example.com" })
    const status = emailStatus()

    expect(status).toMatchObject({ state: "ready", hasLogin: false, warnings: [{ variable: "SMTP_URL", code: "invalid", hint: expect.stringContaining("ignored") }] })
    expect(JSON.stringify(status)).not.toMatch(/url-login|url-password/)
  })
})
