/**
 * @jest-environment node
 */

import { createTransport } from "nodemailer"

import type { EmailConfig } from "@/lib/email/env-rules"
import { classifySmtpError, failureError, sendEmail, transportOptions } from "@/lib/email/transport"
import { createLogger } from "@/lib/utils/logger"

jest.mock("nodemailer", () => ({ createTransport: jest.fn() }))
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

const logger = createLogger("EMAIL")

const config = (overrides: Partial<EmailConfig> = {}): EmailConfig => ({
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: null,
  from: "noreply@example.com",
  replyTo: null,
  postalAddress: null,
  ...overrides,
})

const smtpError = (fields: Record<string, unknown>) => Object.assign(new Error("Message failed: 550 5.1.1 <someone@example.com>: no such user"), fields)

const sendMail = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(createTransport).mockReturnValue({ sendMail } as never)
})

describe("transportOptions", () => {
  it("uses STARTTLS when offered for smtp:// without a login", () => {
    expect(transportOptions(config())).toEqual(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false, requireTLS: false, logger: false, debug: false })
    )
    expect(transportOptions(config())).not.toHaveProperty("auth")
  })

  it("requires TLS once there is a login, so the password never goes as plain text", () => {
    const options = transportOptions(config({ auth: { user: "u", pass: "p" } }))
    expect(options).toMatchObject({ secure: false, requireTLS: true, auth: { user: "u", pass: "p" } })
  })

  it("uses TLS from the start for smtps://", () => {
    expect(transportOptions(config({ server: { host: "smtp.example.com", port: 465, secure: true }, auth: { user: "u", pass: "p" } }))).toMatchObject({
      secure: true,
      requireTLS: false,
    })
  })

  it("sets time limits and keeps the message away from files and URLs", () => {
    expect(transportOptions(config())).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  })
})

describe("classifySmtpError", () => {
  it.each(["5.1.1", "5.1.2", "5.1.10", "5.2.1"])("rejects the mailbox on a 5xx to RCPT TO with %s", (status) => {
    expect(classifySmtpError(smtpError({ command: "RCPT TO", responseCode: 550, response: `550 ${status} no such user` }))).toEqual({
      kind: "rejected",
      smtpCode: 550,
      status,
      step: "RCPT TO",
    })
  })

  it("counts any other 5xx as refused: at DATA, at MAIL FROM, at AUTH, or at RCPT TO with no mailbox code", () => {
    expect(classifySmtpError(smtpError({ command: "DATA", responseCode: 554, response: "554 Message rejected: Email address is not verified." }))).toEqual({
      kind: "refused",
      smtpCode: 554,
      status: null,
      step: "DATA",
    })
    expect(classifySmtpError(smtpError({ command: "MAIL FROM", responseCode: 550, response: "550 5.7.1 sender denied" })).kind).toBe("refused")
    expect(classifySmtpError(smtpError({ code: "EAUTH", command: "AUTH PLAIN", responseCode: 535, response: "535 5.7.8 bad login" }))).toMatchObject({
      kind: "refused",
      step: "AUTH",
    })
    expect(classifySmtpError(smtpError({ command: "RCPT TO", responseCode: 550, response: "550 5.7.1 relay denied" })).kind).toBe("refused")
  })

  it("reads the reply code from the response when nodemailer gives none", () => {
    expect(classifySmtpError(smtpError({ command: "DATA", response: "552 too big" }))).toMatchObject({ kind: "refused", smtpCode: 552 })
  })

  it("counts a 4xx and a connection failure as temporary", () => {
    expect(classifySmtpError(smtpError({ command: "RCPT TO", responseCode: 451, response: "451 4.3.0 try later" }))).toEqual({
      kind: "temporary",
      smtpCode: 451,
      status: "4.3.0",
      step: "RCPT TO",
    })
    expect(classifySmtpError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ESOCKET", command: "CONN" }))).toEqual({
      kind: "temporary",
      smtpCode: null,
      status: null,
      step: "CONN",
    })
    expect(classifySmtpError("not an error")).toEqual({ kind: "temporary", smtpCode: null, status: null, step: null })
  })

  it("counts no answer in time as a timeout", () => {
    expect(classifySmtpError(Object.assign(new Error("Greeting never received"), { code: "ETIMEDOUT" })).kind).toBe("timeout")
  })

  it("counts a missing login and a server without the TLS a login needs as refused", () => {
    expect(classifySmtpError(Object.assign(new Error("Missing credentials"), { code: "ENOAUTH" })).kind).toBe("refused")
    expect(classifySmtpError(Object.assign(new Error("No STARTTLS"), { code: "ETLS" })).kind).toBe("refused")
  })

  it.each(["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN"])(
    "counts a server certificate that fails with %s as refused, since a retry meets the same certificate",
    (tlsCode) => {
      // nodemailer reports a TLS socket error as ESOCKET and keeps the TLS code as originalCode
      const error = Object.assign(new Error("certificate check failed"), { code: "ESOCKET", originalCode: tlsCode, command: "CONN" })
      expect(classifySmtpError(error)).toEqual({ kind: "refused", smtpCode: null, status: null, step: "CONN" })
      expect(classifySmtpError(Object.assign(new Error("certificate check failed"), { code: tlsCode })).kind).toBe("refused")
    }
  )

  it("still counts a dropped connection with another system code as temporary", () => {
    const error = Object.assign(new Error("socket hang up"), { code: "ESOCKET", originalCode: "ECONNRESET", command: "CONN" })
    expect(classifySmtpError(error).kind).toBe("temporary")
  })

  it("never keeps the reply text or an address from the command", () => {
    const failure = classifySmtpError(smtpError({ command: "RCPT TO:<someone@example.com>", responseCode: 550, response: "550 5.1.1 <someone@example.com>" }))
    expect(failure.step).toBe("RCPT TO")
    expect(JSON.stringify(failure)).not.toContain("@")
  })

  it("keeps no step for a command that does not start with a word", () => {
    expect(classifySmtpError(smtpError({ command: "<someone@example.com>", responseCode: 451 })).step).toBeNull()
  })
})

describe("failureError", () => {
  it("holds the class and the reply code only", () => {
    expect(failureError({ kind: "temporary", smtpCode: 451, status: "4.3.0", step: "RCPT TO" }).message).toBe("smtp_temporary 451")
    expect(failureError({ kind: "timeout", smtpCode: null, status: null, step: null }).message).toBe("smtp_timeout")
  })
})

describe("sendEmail", () => {
  const message = { to: { name: "", address: "someone@example.com" }, subject: "Hi" }

  it("sends over the app's own socket and returns the reply code", async () => {
    sendMail.mockResolvedValue({ response: "250 Ok queued as abc" })

    await expect(sendEmail(config(), message)).resolves.toEqual({ ok: true, smtpCode: 250 })
    expect(createTransport).toHaveBeenCalledWith({ ...transportOptions(config()), getSocket: expect.any(Function) })
    expect(sendMail).toHaveBeenCalledWith(message)
    expect(logger.info).toHaveBeenCalledWith("email.sent", { smtpCode: 250 })
  })

  it("returns a classified failure and logs no address", async () => {
    sendMail.mockRejectedValue(smtpError({ command: "RCPT TO", responseCode: 550, response: "550 5.1.1 <someone@example.com>: no such user" }))

    await expect(sendEmail(config(), message)).resolves.toEqual({
      ok: false,
      failure: { kind: "rejected", smtpCode: 550, status: "5.1.1", step: "RCPT TO" },
    })
    expect(JSON.stringify(jest.mocked(logger.warn).mock.calls)).not.toContain("@")
  })

  it("stops when the signal ends, as a timeout", async () => {
    sendMail.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const sent = sendEmail(config(), message, controller.signal)
    controller.abort()

    await expect(sent).resolves.toEqual({ ok: false, failure: expect.objectContaining({ kind: "timeout" }) })
    expect(logger.warn).toHaveBeenCalledWith("email.send_failed", expect.objectContaining({ kind: "timeout" }))
  })

  it("sends nothing on a signal that already ended", async () => {
    await expect(sendEmail(config(), message, AbortSignal.abort())).resolves.toEqual({
      ok: false,
      failure: { kind: "timeout", smtpCode: null, status: null, step: null },
    })
    expect(createTransport).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("reads no code from a reply without one", async () => {
    sendMail.mockResolvedValue({ response: undefined })

    await expect(sendEmail(config(), message)).resolves.toEqual({ ok: true, smtpCode: null })
  })
})
