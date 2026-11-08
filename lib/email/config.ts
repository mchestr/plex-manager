/**
 * The mail set-up from the environment (`SMTP_URL`, `SMTP_USER`,
 * `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_POSTAL_ADDRESS`;
 * `docs/email.md`). There is no settings form: the variables are the only
 * source, like `REDIS_URL`.
 *
 * {@link getEmailConfig} holds the login and is for the transport alone.
 * {@link emailStatus} is what a page may show: the host, the port, the
 * security, the sender and whether a login is set, never the user name or
 * the password.
 *
 * @module lib/email/config
 */

import "server-only"

import { readEmailEnv, type EmailConfig, type EmailEnvProblem } from "@/lib/email/env-rules"
import { getEnv } from "@/lib/env"

/** How the app reaches the server: TLS from the start, STARTTLS when offered, or STARTTLS required (a login). */
export type SmtpSecurity = "tls" | "starttls" | "starttls_required"

/** A problem with a mail variable, as a page may show it. */
export type EmailStatusProblem = Pick<EmailEnvProblem, "variable" | "code" | "hint">

/** The mail set-up as a page may show it: `problems` stop email, `warnings` do not. */
export type EmailStatus =
  | { state: "off" }
  | { state: "invalid"; problems: EmailStatusProblem[]; warnings: EmailStatusProblem[] }
  | {
      state: "ready"
      warnings: EmailStatusProblem[]
      host: string
      port: number
      security: SmtpSecurity
      from: string
      replyTo: string | null
      hasLogin: boolean
      hasPostalAddress: boolean
    }

/** The usable mail set-up, with its login, or null when email is off or a variable is wrong. Server code only. */
export function getEmailConfig(): EmailConfig | null {
  const result = readEmailEnv(getEnv())
  return result.state === "ready" ? result.config : null
}

/** Whether the app can send email: `SMTP_URL` and `EMAIL_FROM` are set, and every mail variable is usable. */
export function emailConfigured(): boolean {
  return getEmailConfig() !== null
}

/** The security the transport uses for `config`. @internal Tests check each case. */
export function smtpSecurity(config: EmailConfig): SmtpSecurity {
  if (config.server.secure) return "tls"
  return config.auth ? "starttls_required" : "starttls"
}

/** The mail set-up without its secrets, for Admin > Settings > Email. */
export function emailStatus(): EmailStatus {
  const result = readEmailEnv(getEnv())
  if (result.state === "off") return { state: "off" }
  const shown = (blocking: boolean) =>
    result.problems.filter((problem) => problem.blocking === blocking).map(({ variable, code, hint }) => ({ variable, code, hint }))
  if (result.state === "invalid") return { state: "invalid", problems: shown(true), warnings: shown(false) }
  const { config } = result
  return {
    state: "ready",
    warnings: shown(false),
    host: config.server.host,
    port: config.server.port,
    security: smtpSecurity(config),
    from: config.from,
    replyTo: config.replyTo,
    hasLogin: config.auth !== null,
    hasPostalAddress: config.postalAddress !== null,
  }
}
