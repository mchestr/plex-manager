/**
 * The Warning emails card: the saved switch, the days before removal, the
 * mail server and the removal rule as a summary, until Edit swaps in the
 * form. The days must be whole numbers from 1 to 90, each once, at most
 * four, and the largest at most half the threshold. While email or Redis is
 * not set up, the switch cannot be turned on, and the card says why. The
 * switch's hint says that turning it off can remove unwarned members.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { updateInactivityWarnings } from "@/actions/admin/inactivity"
import { parseLeads } from "@/components/admin/inactivity/warnings-form"
import { InactivityWarningsSection } from "@/components/admin/inactivity/warnings-section"
import type { InactivityMail } from "@/lib/data/inactivity"
import type { InactivityWarningSettings } from "@/lib/inactivity/settings"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/inactivity", () => ({ updateInactivityWarnings: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const OFF: InactivityWarningSettings = { warningsEnabled: false, warningDays: [30, 7, 1] }
const ON: InactivityWarningSettings = { warningsEnabled: true, warningDays: [14, 2] }
const READY: InactivityMail = { ready: true, from: "noreply@example.com" }
const NO_MAIL: InactivityMail = { ready: false, from: null }

async function renderSection({ saved = OFF, mail = READY, queued = true, thresholdDays = 180 }: {
  saved?: InactivityWarningSettings
  mail?: InactivityMail
  queued?: boolean
  thresholdDays?: number
} = {}) {
  await act(async () => {
    render(<InactivityWarningsSection saved={saved} thresholdDays={thresholdDays} mail={mail} queued={queued} />)
  })
}

const summaryRow = (key: string) => screen.getByTestId(`settings-inactivity-warnings-summary-${key}`)
const toggle = () => screen.getByTestId("admin-inactivity-warnings-toggle")
const days = () => screen.getByTestId("admin-inactivity-warning-days-input")
const save = () => screen.getByTestId("settings-inactivity-warnings-save")

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-inactivity-warnings-edit"))
}

async function typeDays(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(days())
  if (value) await user.type(days(), value)
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/inactivity")
})

describe("parseLeads", () => {
  it.each([
    ["30, 7, 1", [30, 7, 1]],
    ["1 7 30", [30, 7, 1]],
    [" 14,2 ", [14, 2]],
    ["1,2,3,4", [4, 3, 2, 1]],
    ["90", [90]],
  ])("reads %j as %j", (text, expected) => {
    expect(parseLeads(text, 180)).toEqual({ days: expected })
  })

  it.each([
    ["", "Enter whole numbers of days, such as 30, 7, 1"],
    ["7.5", "Enter whole numbers of days, such as 30, 7, 1"],
    ["-1", "Enter whole numbers of days, such as 30, 7, 1"],
    ["seven", "Enter whole numbers of days, such as 30, 7, 1"],
    ["7, 0", "Each number of days must be 1 or more"],
    ["7, 7", "Use each number of days once"],
    ["1, 2, 3, 4, 5", "Enter at most 4 numbers of days"],
    ["91", "Use at most 90 days before removal"],
  ])("refuses %j", (text, error) => {
    expect(parseLeads(text, 180)).toEqual({ error })
  })

  it("caps a lead at 90 days, and the largest at half a shorter threshold", () => {
    expect(parseLeads("90, 7", 3650)).toEqual({ days: [90, 7] })
    expect(parseLeads("120", 3650)).toEqual({ error: "Use at most 90 days before removal" })
    expect(parseLeads("51", 100)).toEqual({ error: "Use at most 50 days, half of the 100 days without a play" })
  })
})

describe("InactivityWarningsSection", () => {
  describe("view mode", () => {
    it("summarises the switch, the days, the mail server and the rule", async () => {
      await renderSection()

      expect(screen.getByRole("heading", { name: "Warning emails" })).toBeInTheDocument()
      expect(summaryRow("enabled")).toHaveTextContent(/^Warning emailsOff$/)
      expect(summaryRow("days")).toHaveTextContent(/^Days before removal30, 7 and 1$/)
      expect(summaryRow("mail")).toHaveTextContent("Set up: sends as noreply@example.com. Email settings has the test email.")
      expect(screen.getByTestId("settings-inactivity-warnings-summary-mail-link")).toHaveAttribute("href", "/admin/settings#email")
      expect(summaryRow("gate")).toHaveTextContent("With warning emails on, the run removes a member only after their last warning.")
    })

    it("shows warnings on with one lead or two", async () => {
      await renderSection({ saved: ON })
      expect(summaryRow("enabled")).toHaveTextContent("On")
      expect(summaryRow("days")).toHaveTextContent(/^Days before removal14 and 2$/)
    })

    it("shows a single lead as one number", async () => {
      await renderSection({ saved: { warningsEnabled: false, warningDays: [10] } })
      expect(summaryRow("days")).toHaveTextContent(/^Days before removal10$/)
    })

    it("says email is not set up, in the summary and the description", async () => {
      await renderSection({ mail: NO_MAIL })
      expect(summaryRow("mail")).toHaveTextContent("Not set up. Email settings")
      expect(screen.getByTestId("settings-inactivity-warnings-section")).toHaveTextContent("Email is not set up, so warnings cannot be turned on.")
    })
  })

  describe("edit mode", () => {
    it("saves the switch and the days largest first, then returns to the summary", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivityWarnings).mockResolvedValue({ success: true, data: null })
      await renderSection()

      await edit(user)
      expect(toggle()).toHaveAccessibleDescription(/removes a member only after their last warning/)
      expect(days()).toHaveValue("30, 7, 1")
      await user.click(toggle())
      await typeDays(user, "1, 14")
      await user.click(save())

      expect(updateInactivityWarnings).toHaveBeenCalledWith({ warningsEnabled: true, warningDays: [14, 1] })
      expect(mockShowSuccess).toHaveBeenCalledWith("Warning email settings saved")
      expect(await screen.findByTestId("settings-inactivity-warnings-summary")).toBeInTheDocument()
    })

    it("stops a save on days the rules refuse, with the reason on the field", async () => {
      const user = userEvent.setup()
      await renderSection({ thresholdDays: 45 })

      await edit(user)
      await typeDays(user, "25, 7")
      expect(days()).toHaveAccessibleDescription(/Use at most 22 days, half of the 45 days without a play/)
      await user.click(save())

      expect(updateInactivityWarnings).not.toHaveBeenCalled()
      expect(screen.getByTestId("settings-inactivity-warnings-editing")).toBeInTheDocument()
      await waitFor(() => expect(days()).toHaveAttribute("aria-invalid", "true"))
    })

    it("shows the server's reason on the field it names, until that field changes", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivityWarnings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Set up Redis first.",
        fieldErrors: { warningsEnabled: ["Set up Redis first."] },
      })
      await renderSection()

      await edit(user)
      await user.click(toggle())
      await user.click(save())

      expect(await screen.findByTestId("admin-inactivity-warnings-error")).toHaveTextContent("Set up Redis first.")
      expect(mockShowError).not.toHaveBeenCalled()
      await waitFor(() => expect(toggle()).not.toHaveAttribute("data-disabled"))
      await user.click(toggle())
      expect(screen.queryByTestId("admin-inactivity-warnings-error")).not.toBeInTheDocument()
    })

    it("toasts a refusal no field explains, and stays open", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivityWarnings).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the warning email settings" })
      await renderSection()

      await edit(user)
      await user.click(toggle())
      await user.click(save())

      await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the warning email settings"))
      expect(screen.getByTestId("settings-inactivity-warnings-form")).toBeInTheDocument()
    })

    it("clears a refused field's error on Cancel", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivityWarnings).mockResolvedValue({
        success: false,
        code: "VALIDATION",
        error: "Too many",
        fieldErrors: { warningDays: ["Too many"] },
      })
      await renderSection()

      await edit(user)
      await typeDays(user, "20")
      await user.click(save())
      expect(await screen.findByText("Too many")).toBeInTheDocument()

      await user.click(screen.getByTestId("settings-inactivity-warnings-cancel"))
      await user.click(await screen.findByTestId("settings-inactivity-warnings-discard-dialog-confirm"))
      await edit(user)
      expect(screen.queryByText("Too many")).not.toBeInTheDocument()
    })

    it.each([
      ["email", { mail: NO_MAIL }, "Email is not set up, so warnings cannot be turned on.", true],
      ["Redis", { queued: false }, "Redis is not set up, so warnings cannot be turned on.", false],
    ])("cannot turn warnings on without %s, and says why", async (_case, props, reason, emailLink) => {
      const user = userEvent.setup()
      await renderSection(props)

      await edit(user)
      const form = screen.getByTestId("settings-inactivity-warnings-form")
      const box = within(form).getByRole("checkbox", { name: "Email members before the run removes their access" })
      expect(box).toHaveAttribute("data-disabled")
      expect(box).toHaveAccessibleDescription(new RegExp(reason.replace(/\./g, "\\.")))
      const blocked = screen.getByTestId("admin-inactivity-warnings-blocked")
      expect(blocked).toHaveTextContent(reason)
      expect(within(blocked).queryByRole("link", { name: "Set up email" }) !== null).toBe(emailLink)
    })

    it("lets warnings that are on be turned off while email is not set up", async () => {
      const user = userEvent.setup()
      jest.mocked(updateInactivityWarnings).mockResolvedValue({ success: true, data: null })
      await renderSection({ saved: ON, mail: NO_MAIL })

      await edit(user)
      expect(screen.queryByTestId("admin-inactivity-warnings-blocked")).not.toBeInTheDocument()
      // The switch says what turning it off does to members with no sent warning
      expect(toggle()).toHaveAccessibleDescription(/Turning the emails off lets the next run remove members with no sent warning/)
      await user.click(toggle())
      await user.click(save())

      expect(updateInactivityWarnings).toHaveBeenCalledWith({ warningsEnabled: false, warningDays: [14, 2] })
    })
  })
})
