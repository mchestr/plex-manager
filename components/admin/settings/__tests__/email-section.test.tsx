/**
 * The Email section (Connections): the mail set-up from the environment,
 * read only, its test email and the last test.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { sendTestEmail } from "@/actions/admin/email"
import { EmailSection } from "@/components/admin/settings/sections/email-section"
import { useToast } from "@/components/ui/toast"
import type { EmailSettings } from "@/lib/data/email"

jest.mock("@/actions/admin/email", () => ({ sendTestEmail: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: jest.fn() }))

const toast = { showSuccess: jest.fn(), showError: jest.fn() }

const READY: EmailSettings = {
  status: {
    state: "ready",
    warnings: [],
    host: "smtp.example.com",
    port: 587,
    security: "starttls_required",
    from: "noreply@example.com",
    replyTo: null,
    hasLogin: true,
    hasPostalAddress: false,
  },
  lastTest: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useToast).mockReturnValue(toast as never)
})

describe("EmailSection", () => {
  it("names the variables to set when email is off", () => {
    render(<EmailSection settings={{ status: { state: "off" }, lastTest: null }} />)

    expect(screen.getByTestId("settings-email-status")).toHaveTextContent("Not set up")
    expect(screen.getByTestId("settings-email-off")).toHaveTextContent("set SMTP_URL and EMAIL_FROM on the web and worker containers")
    expect(screen.queryByTestId("settings-email-send-test")).not.toBeInTheDocument()
  })

  it("lists the variables to fix", () => {
    render(
      <EmailSection
        settings={{ status: { state: "invalid", problems: [{ variable: "EMAIL_FROM", code: "missing", hint: "not set" }], warnings: [] }, lastTest: null }}
      />
    )

    expect(screen.getByTestId("settings-email-status")).toHaveTextContent("Needs setup")
    expect(screen.getByTestId("settings-email-problem-EMAIL_FROM")).toHaveTextContent("EMAIL_FROM not set")
    expect(screen.queryByTestId("settings-email-send-test")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-email-warnings")).not.toBeInTheDocument()
  })

  it("lists a problem that does not stop email apart from the ones that do", () => {
    const status: EmailSettings["status"] = {
      state: "invalid",
      problems: [{ variable: "EMAIL_FROM", code: "missing", hint: "not set" }],
      warnings: [{ variable: "SMTP_URL", code: "invalid", hint: "holds a login, which is ignored" }],
    }
    render(<EmailSection settings={{ status, lastTest: null }} />)

    expect(screen.queryByTestId("settings-email-problem-SMTP_URL")).not.toBeInTheDocument()
    expect(screen.getByTestId("settings-email-warning-SMTP_URL")).toHaveTextContent("SMTP_URL holds a login, which is ignored")
  })

  it("shows the host, the port, the security and the sender, and only whether a login is set", () => {
    render(<EmailSection settings={READY} />)

    expect(screen.getByTestId("settings-email-summary-status")).toHaveTextContent("Set up")
    expect(screen.getByTestId("settings-email-summary-server")).toHaveTextContent("smtp.example.com:587")
    expect(screen.getByTestId("settings-email-summary-security")).toHaveTextContent("STARTTLS, required for the login")
    expect(screen.getByTestId("settings-email-summary-from")).toHaveTextContent("noreply@example.com")
    expect(screen.getByTestId("settings-email-summary-reply-to")).toHaveTextContent("Not set")
    expect(screen.getByTestId("settings-email-summary-login")).toHaveTextContent("Set")
    expect(screen.getByTestId("settings-email-summary-postal")).toHaveTextContent("Not set")
    expect(screen.queryByTestId("settings-email-status")).not.toBeInTheDocument()
    expect(screen.queryByTestId("settings-email-warnings")).not.toBeInTheDocument()
  })

  it("names a problem that does not stop email, such as a login in SMTP_URL", () => {
    const warnings = [{ variable: "SMTP_URL" as const, code: "invalid" as const, hint: "holds a login, which is ignored" }]
    render(<EmailSection settings={{ ...READY, status: { ...READY.status, hasLogin: false, warnings } as EmailSettings["status"] }} />)

    expect(screen.getByTestId("settings-email-summary-status")).toHaveTextContent("Set up")
    expect(screen.getByTestId("settings-email-warnings")).toHaveTextContent("A variable needs a look.")
    expect(screen.getByTestId("settings-email-warning-SMTP_URL")).toHaveTextContent("SMTP_URL holds a login, which is ignored")
    expect(screen.getByTestId("settings-email-send-test")).toBeInTheDocument()
  })

  it("shows the other securities, a reply address and no login", () => {
    const { rerender } = render(
      <EmailSection settings={{ ...READY, status: { ...READY.status, security: "tls", replyTo: "help@example.com", hasLogin: false, hasPostalAddress: true } as EmailSettings["status"] }} />
    )
    expect(screen.getByTestId("settings-email-summary-security")).toHaveTextContent("TLS from the start")
    expect(screen.getByTestId("settings-email-summary-reply-to")).toHaveTextContent("help@example.com")
    expect(screen.getByTestId("settings-email-summary-login")).toHaveTextContent("None")
    expect(screen.getByTestId("settings-email-summary-postal")).toHaveTextContent("Set")

    rerender(<EmailSection settings={{ ...READY, status: { ...READY.status, security: "starttls" } as EmailSettings["status"] }} />)
    expect(screen.getByTestId("settings-email-summary-security")).toHaveTextContent("STARTTLS when the server offers it")
  })

  it("shows the last test, linked to its audit event", () => {
    render(<EmailSection settings={{ ...READY, lastTest: { at: new Date("2027-02-01T10:00:00Z"), by: "Sam", eventId: "evt-1", outcome: "Sent" } }} />)

    expect(screen.getByTestId("settings-email-last-test")).toHaveTextContent("Last test")
    expect(screen.getByTestId("settings-email-last-test")).toHaveTextContent("by Sam: Sent")
    expect(screen.getByTestId("settings-email-last-test-link")).toHaveAttribute("href", "/admin/audit/evt-1")
  })

  it("sends a test email and says it was sent, or queued", async () => {
    const user = userEvent.setup()
    jest.mocked(sendTestEmail).mockResolvedValueOnce({ success: true, data: { queued: false } })
    render(<EmailSection settings={READY} />)

    await user.click(screen.getByTestId("settings-email-send-test"))
    expect(toast.showSuccess).toHaveBeenCalledWith("Test email sent. Check your inbox.")

    jest.mocked(sendTestEmail).mockResolvedValueOnce({ success: true, data: { queued: true } })
    await user.click(screen.getByTestId("settings-email-send-test"))
    expect(toast.showSuccess).toHaveBeenCalledWith("Test email queued. It should arrive in a minute.")
  })

  it("shows the action's error copy", async () => {
    const user = userEvent.setup()
    jest.mocked(sendTestEmail).mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "The mail server refused the email." })
    render(<EmailSection settings={READY} />)

    await user.click(screen.getByTestId("settings-email-send-test"))
    expect(toast.showError).toHaveBeenCalledWith("The mail server refused the email.")
    expect(toast.showSuccess).not.toHaveBeenCalled()
  })
})
