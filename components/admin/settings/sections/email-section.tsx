import Link from "next/link"

import { SendTestEmail } from "@/components/admin/settings/send-test-email"
import { Alert } from "@/components/ui/alert"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { SettingsSection } from "@/components/ui/settings-section"
import { Time } from "@/components/ui/time"
import { auditEvent } from "@/lib/admin/routes"
import type { LastTestEmail, EmailSettings } from "@/lib/data/email"
import type { EmailStatus, EmailStatusProblem, SmtpSecurity } from "@/lib/email/config"

const SECURITY: Record<SmtpSecurity, string> = {
  tls: "TLS from the start",
  starttls: "STARTTLS when the server offers it",
  starttls_required: "STARTTLS, required for the login",
}

const Variable = ({ children }: { children: string }) => <code className="font-mono text-label">{children}</code>

function LastTest({ meta }: { meta: LastTestEmail }) {
  return (
    <p data-testid="settings-email-last-test">
      Last test <Time value={meta.at} nowLabel="just now" />{" "}
      <Link href={auditEvent(meta.eventId)} className="text-foreground underline underline-offset-3" data-testid="settings-email-last-test-link">
        by {meta.by}
      </Link>
      : {meta.outcome}
    </p>
  )
}

/** Problems that do not stop email, such as a login in SMTP_URL that the app ignores. */
function Warnings({ warnings }: { warnings: EmailStatusProblem[] }) {
  return (
    <Alert tone="warning" role="status" title="A variable needs a look." data-testid="settings-email-warnings">
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning.variable} data-testid={`settings-email-warning-${warning.variable}`}>
            <Variable>{warning.variable}</Variable> {warning.hint}
          </li>
        ))}
      </ul>
    </Alert>
  )
}

function Ready({ status }: { status: Extract<EmailStatus, { state: "ready" }> }) {
  return (
    <>
      {status.warnings.length > 0 && <Warnings warnings={status.warnings} />}
      <SettingsSummary data-testid="settings-email-summary">
        <SettingsSummaryRow label="Status" data-testid="settings-email-summary-status">
          Set up
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Mail server" mono data-testid="settings-email-summary-server">
          {`${status.host}:${status.port}`}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Security" data-testid="settings-email-summary-security">
          {SECURITY[status.security]}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Sender" mono data-testid="settings-email-summary-from">
          {status.from}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Reply-To" mono data-testid="settings-email-summary-reply-to">
          {status.replyTo ?? <NotSet />}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Login" data-testid="settings-email-summary-login">
          {status.hasLogin ? "Set" : <NotSet>None</NotSet>}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Postal address" data-testid="settings-email-summary-postal">
          {status.hasPostalAddress ? "Set" : <NotSet />}
        </SettingsSummaryRow>
      </SettingsSummary>
      <div className="flex flex-col gap-2">
        <SendTestEmail />
        <p className="text-label text-muted-foreground">It goes to your own address on file.</p>
      </div>
    </>
  )
}

function Invalid({ problems }: { problems: EmailStatusProblem[] }) {
  return (
    <div className="flex flex-col gap-2 text-ui" data-testid="settings-email-invalid">
      <p>Email is off until these variables are fixed:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {problems.map((problem) => (
          <li key={problem.variable} data-testid={`settings-email-problem-${problem.variable}`}>
            <Variable>{problem.variable}</Variable> {problem.hint}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Off() {
  return (
    <p className="text-ui text-muted-foreground" data-testid="settings-email-off">
      Not set up. To send email, set <Variable>SMTP_URL</Variable> and <Variable>EMAIL_FROM</Variable> on the web and worker containers. A
      mail server with a login also needs <Variable>SMTP_USER</Variable> and <Variable>SMTP_PASSWORD</Variable>.
    </p>
  )
}

/**
 * Email (Connections): the mail server from the environment, read only,
 * and "Send a test email". It shows the host, the port, the security and
 * the sender, never the login's user name or password (`emailStatus()`).
 * "Last test" is the newest `EMAIL_TEST_SENT` audit row. See `docs/email.md`.
 */
export function EmailSection({ settings }: { settings: EmailSettings }) {
  const { status, lastTest } = settings
  return (
    <SettingsSection
      id="email"
      title="Email"
      description="The mail server the app sends email through. Environment variables set it up."
      status={status.state === "off" ? "notConfigured" : status.state === "invalid" ? "incomplete" : undefined}
      footerMeta={lastTest && <LastTest meta={lastTest} />}
    >
      {status.state === "ready" && <Ready status={status} />}
      {status.state === "invalid" && (
        <>
          <Invalid problems={status.problems} />
          {status.warnings.length > 0 && <Warnings warnings={status.warnings} />}
        </>
      )}
      {status.state === "off" && <Off />}
    </SettingsSection>
  )
}
