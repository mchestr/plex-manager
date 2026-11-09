/**
 * The rules for the mail variables (`docs/email.md`): which values make a
 * usable mail set-up, and what is wrong with the others. Pure, so the boot
 * check in `lib/env.ts` and `lib/email/config.ts` share it without an import
 * cycle.
 *
 * With `SMTP_URL` unset, email is off and nothing is checked. With it set:
 *
 * | Problem                                         | Variable        | Blocks sending |
 * |-------------------------------------------------|-----------------|----------------|
 * | Not `smtp://host[:port]` or `smtps://host[:port]` | `SMTP_URL`      | yes            |
 * | A user name or a password in the URL            | `SMTP_URL`      | no: ignored    |
 * | `EMAIL_FROM` not set                            | `EMAIL_FROM`    | yes            |
 * | `EMAIL_FROM` or `EMAIL_REPLY_TO` not one address | that variable   | yes            |
 * | Only one of `SMTP_USER` and `SMTP_PASSWORD`     | the missing one | yes            |
 *
 * No problem carries a value, so a hint is safe to log.
 *
 * @module lib/email/env-rules
 */

import "server-only"

import { z } from "zod"

/** The mail server from `SMTP_URL`: host and port only, never a login. */
interface SmtpServer {
  host: string
  port: number
  /** TLS from the start (`smtps://`). Otherwise STARTTLS, which a login makes required. */
  secure: boolean
}

/** The mail variables as the environment holds them. */
export interface EmailEnv {
  SMTP_URL?: string
  SMTP_USER?: string
  SMTP_PASSWORD?: string
  EMAIL_FROM?: string
  EMAIL_REPLY_TO?: string
  EMAIL_POSTAL_ADDRESS?: string
}

/** A usable mail set-up. `auth` is a secret: server code only, never a page, a log or a result. */
export interface EmailConfig {
  server: SmtpServer
  auth: { user: string; pass: string } | null
  from: string
  replyTo: string | null
  postalAddress: string | null
}

export interface EmailEnvProblem {
  variable: keyof EmailEnv
  code: "missing" | "invalid"
  hint: string
  /** The app sends no email until it is fixed. */
  blocking: boolean
}

export type EmailEnvResult =
  | { state: "off" }
  | { state: "ready"; config: EmailConfig; problems: EmailEnvProblem[] }
  | { state: "invalid"; problems: EmailEnvProblem[] }

const addressSchema = z.email().max(254)

/** Whether `value` is exactly one plain address, with no display name and no list. */
export function isMailAddress(value: string | null | undefined): value is string {
  return typeof value === "string" && addressSchema.safeParse(value).success
}

/** `SMTP_URL` as a server, or null when it is not `smtp://` or `smtps://` with a host. @internal Tests check the parsing. */
export function parseSmtpUrl(value: string): { server: SmtpServer; hasLogin: boolean } | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if ((url.protocol !== "smtp:" && url.protocol !== "smtps:") || !url.hostname) return null
  const secure = url.protocol === "smtps:"
  const port = url.port ? Number(url.port) : secure ? 465 : 587
  // An IPv6 literal keeps its brackets in a URL; the socket wants it bare
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  return { server: { host, port, secure }, hasLogin: Boolean(url.username || url.password) }
}

const present = (value: string | undefined): string | null => (value?.trim() ? value.trim() : null)

const ADDRESS_HINT = "must be one plain address, such as noreply@example.com"

/** The mail set-up the variables describe, and what is wrong with them. */
export function readEmailEnv(env: EmailEnv): EmailEnvResult {
  const url = present(env.SMTP_URL)
  if (!url) return { state: "off" }

  const problems: EmailEnvProblem[] = []
  const problem = (variable: keyof EmailEnv, code: EmailEnvProblem["code"], hint: string, blocking = true) =>
    problems.push({ variable, code, hint, blocking })

  const parsed = parseSmtpUrl(url)
  if (!parsed) problem("SMTP_URL", "invalid", "must be smtp://host:port or smtps://host:port")
  else if (parsed.hasLogin) problem("SMTP_URL", "invalid", "holds a login, which is ignored; put the login in SMTP_USER and SMTP_PASSWORD", false)

  const from = present(env.EMAIL_FROM)
  if (!from) problem("EMAIL_FROM", "missing", "not set; the app sends no email without a sender")
  else if (!isMailAddress(from)) problem("EMAIL_FROM", "invalid", ADDRESS_HINT)

  const replyTo = present(env.EMAIL_REPLY_TO)
  if (replyTo && !isMailAddress(replyTo)) problem("EMAIL_REPLY_TO", "invalid", ADDRESS_HINT)

  const user = present(env.SMTP_USER)
  const pass = env.SMTP_PASSWORD ? env.SMTP_PASSWORD : null
  if (user && !pass) problem("SMTP_PASSWORD", "missing", "not set, but SMTP_USER is")
  if (pass && !user) problem("SMTP_USER", "missing", "not set, but SMTP_PASSWORD is")

  if (!parsed || !from || problems.some((entry) => entry.blocking)) return { state: "invalid", problems }
  return {
    state: "ready",
    config: {
      server: parsed.server,
      auth: user && pass ? { user, pass } : null,
      from,
      replyTo,
      postalAddress: present(env.EMAIL_POSTAL_ADDRESS),
    },
    problems,
  }
}
