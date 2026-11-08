/**
 * Sends one email over SMTP with nodemailer, and sorts a failure into a class
 * a caller can act on.
 *
 * ## Transport
 *
 * One connection per send, no pool. `smtps://` uses TLS from the start;
 * `smtp://` uses STARTTLS when the server offers it, and requires it once a
 * login is set, so a password never crosses the network as plain text.
 * nodemailer's logger and debug output stay off, and the message may not read
 * files or URLs.
 *
 * ## Time limit and abort
 *
 * A send ends when its signal ends: after 60 seconds by default, or when the
 * caller's signal (such as the worker's shutdown) ends first. A signal that
 * has already ended sends nothing. Otherwise the app owns the socket
 * (`lib/email/socket.ts`) and destroys it, so the SMTP session stops and the
 * result is a `timeout`.
 *
 * SMTP cannot say whether the server kept a message whose reply never came.
 * A `timeout` or `temporary` failure after the whole message went out can
 * still mean that the server took it, so a retry can send a second copy. That
 * window is the wait for the last reply only, and every SMTP client has it.
 *
 * ## Failure classes (RFC 3463 status codes)
 *
 * | Reply                                                        | Class       |
 * |--------------------------------------------------------------|-------------|
 * | 5xx to `RCPT TO` with a mailbox code (5.1.1, 5.1.2, 5.1.10, 5.2.1) | `rejected`  |
 * | Any other 5xx, a refused login, no TLS where a login needs it | `refused`   |
 * | 4xx, a dropped or refused connection, a DNS failure          | `temporary` |
 * | No answer within the time limit                              | `timeout`   |
 *
 * A failure holds the class, the reply code, the status code and the SMTP
 * step only. The reply text often repeats the address, so it is never kept,
 * logged or returned, and {@link failureError} is the only error a caller
 * should throw.
 *
 * @module lib/email/transport
 */

import "server-only"

import { createTransport, type NodemailerError, type SendMailOptions, type SMTPTransportOptions } from "nodemailer"

import type { EmailConfig } from "@/lib/email/env-rules"
import { abortableSocket, abortError } from "@/lib/email/socket"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("EMAIL")

/** The longest one send may take when the caller gives no signal. */
const SEND_LIMIT_MS = 60_000

export type SmtpFailureKind = "rejected" | "refused" | "temporary" | "timeout"

/** @internal The warning email job reads it to set the row's status. */
export interface SmtpFailure {
  kind: SmtpFailureKind
  /** The server's reply code, such as 550; null without a reply. */
  smtpCode: number | null
  /** The RFC 3463 status code, such as "5.1.1"; null when the reply has none. */
  status: string | null
  /** The SMTP step that failed, such as "RCPT TO"; null before a command. */
  step: string | null
}

export type SendResult = { ok: true; smtpCode: number | null } | { ok: false; failure: SmtpFailure }

/** Mailbox status codes: the address cannot receive mail (RFC 3463 5.1.1, 5.1.2, 5.1.10, 5.2.1). */
const MAILBOX_STATUSES = new Set(["5.1.1", "5.1.2", "5.1.10", "5.2.1"])

/** nodemailer error codes that no retry fixes: a refused or missing login, or no TLS where it is required. */
const PERMANENT_CODES = new Set(["EAUTH", "ENOAUTH", "ETLS", "EREQUIRETLS", "ECONFIG", "EENVELOPE"])

const TIMEOUT_CODES = new Set(["ETIMEDOUT", "ETIME", "ABORT_ERR"])

/** The nodemailer options for `config`. @internal Tests check the TLS rules. */
export function transportOptions(config: EmailConfig): SMTPTransportOptions {
  const { server, auth } = config
  return {
    host: server.host,
    port: server.port,
    secure: server.secure,
    requireTLS: !server.secure && auth !== null,
    ...(auth ? { auth: { user: auth.user, pass: auth.pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

function replyCode(response: unknown): number | null {
  const match = typeof response === "string" ? /^([2-5]\d\d)\b/.exec(response) : null
  return match ? Number(match[1]) : null
}

function statusCode(response: unknown): string | null {
  const match = typeof response === "string" ? /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(response) : null
  return match ? match[1] : null
}

const STEPS = ["MAIL FROM", "RCPT TO", "DATA", "AUTH", "STARTTLS", "EHLO", "HELO"]

/** The SMTP step a command names: a known step, else its first word, never an argument (an address). */
function stepOf(command: unknown): string | null {
  if (typeof command !== "string") return null
  const upper = command.toUpperCase()
  return STEPS.find((step) => upper.startsWith(step)) ?? /^[A-Z]+/.exec(upper)?.[0] ?? null
}

function asNodemailerError(error: unknown): Partial<NodemailerError> {
  return typeof error === "object" && error !== null ? (error as Partial<NodemailerError>) : {}
}

/** The class of a failed send; see the module comment. @internal Tests check each class. */
export function classifySmtpError(error: unknown): SmtpFailure {
  const { code, command, response, responseCode } = asNodemailerError(error)
  const smtpCode = typeof responseCode === "number" ? responseCode : replyCode(response)
  const status = statusCode(response)
  const step = stepOf(command)
  const failure = (kind: SmtpFailureKind): SmtpFailure => ({ kind, smtpCode, status, step })

  if (smtpCode !== null && smtpCode >= 500) {
    return failure(step === "RCPT TO" && status !== null && MAILBOX_STATUSES.has(status) ? "rejected" : "refused")
  }
  if (smtpCode !== null && smtpCode >= 400) return failure("temporary")
  if (typeof code === "string" && TIMEOUT_CODES.has(code)) return failure("timeout")
  if (typeof code === "string" && PERMANENT_CODES.has(code)) return failure("refused")
  return failure("temporary")
}

/**
 * The error a caller throws for `failure`: the class and the reply code only,
 * such as `smtp_temporary 451`, so a queue's stored reason holds no address.
 *
 * @internal The warning email job throws it to retry a temporary failure.
 */
export function failureError(failure: SmtpFailure): Error {
  return new Error(`smtp_${failure.kind}${failure.smtpCode === null ? "" : ` ${failure.smtpCode}`}`)
}

/** A promise that rejects as an `ABORT_ERR` when `signal` ends, and a way to stop listening. */
function untilAborted(signal: AbortSignal): { aborted: Promise<never>; stop: () => void } {
  const { promise, reject } = Promise.withResolvers<never>()
  const abort = () => reject(abortError())
  signal.addEventListener("abort", abort, { once: true })
  return { aborted: promise, stop: () => signal.removeEventListener("abort", abort) }
}

function failed(error: unknown): SendResult {
  const failure = classifySmtpError(error)
  logger.warn("email.send_failed", { ...failure })
  return { ok: false, failure }
}

/**
 * Sends `message` (from `buildMessage`, `lib/email/message.ts`) with `config`.
 * Never throws: a failure comes back classified. When `signal` ends, the
 * send stops and returns a `timeout` (see the module comment); without a
 * signal, the send takes 60 seconds at most.
 */
export async function sendEmail(config: EmailConfig, message: SendMailOptions, signal: AbortSignal = AbortSignal.timeout(SEND_LIMIT_MS)): Promise<SendResult> {
  if (signal.aborted) return failed(abortError())
  const socket = abortableSocket(config.server, signal)
  const { aborted, stop } = untilAborted(signal)
  try {
    const transport = createTransport({ ...transportOptions(config), getSocket: socket.getSocket })
    const info = await Promise.race([transport.sendMail(message), aborted])
    const smtpCode = replyCode(info.response)
    logger.info("email.sent", { smtpCode })
    return { ok: true, smtpCode }
  } catch (error) {
    return failed(error)
  } finally {
    stop()
    socket.release()
  }
}
