/**
 * The Settings tab (UX 4.10, TS 12.7 item 10): six sections in page order,
 * read first; `?section=` opens one in Edit with its first field focused;
 * one section at a time; and the browser's leave prompt while one has
 * unsaved changes.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { buildSettingsData } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { SETTINGS_SECTIONS, SettingsTab } from "@/components/admin/cleanup/settings/settings-tab"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn(), refreshCleanupData: jest.fn(), runCleanupNow: jest.fn() }))
jest.mock("@/actions/admin/cleanup-preview", () => ({ previewCleanupProtectionImpact: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
let mockParams = new URLSearchParams()
jest.mock("next/navigation", () => ({ useSearchParams: () => mockParams }))

async function renderTab(query = "") {
  mockParams = new URLSearchParams(query)
  await act(async () => {
    render(<SettingsTab data={buildSettingsData()} />)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(previewCleanupProtectionImpact).mockResolvedValue({ success: true, data: { rules: [], protects: {}, leaves: 0 } })
})

describe("SettingsTab", () => {
  it("shows the six sections in order, each read first", async () => {
    await renderTab()

    const sections = screen.getAllByTestId(/^settings-cleanup-[a-z]+-section$/).map((s) => s.id)
    expect(sections).toEqual([...SETTINGS_SECTIONS])
    for (const id of SETTINGS_SECTIONS) expect(screen.getByTestId(`settings-${id}-edit`)).toBeInTheDocument()
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })

  it("opens ?section= in Edit and focuses its first field", async () => {
    await renderTab("section=cleanup-feature&returnTo=/admin/cleanup/rules/a11y-cleanup-rule-live/turn-on")

    expect(screen.getByTestId("settings-cleanup-feature-form")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("cleanup-feature-enabled")).toHaveFocus())
    expect(previewCleanupProtectionImpact).toHaveBeenCalledTimes(1)
  })

  it("ignores an unknown section and a returnTo that is not a turn-on page", async () => {
    await renderTab("section=cleanup-nope&returnTo=/admin/settings")

    expect(screen.queryByTestId(/-form$/)).not.toBeInTheDocument()
    expect(previewCleanupProtectionImpact).not.toHaveBeenCalled()
  })

  it("opens one clean section at a time, and asks the browser before leaving with unsaved changes", async () => {
    const user = userEvent.setup()
    await renderTab()

    await user.click(screen.getByTestId("settings-cleanup-defaults-edit"))
    await user.click(screen.getByTestId("settings-cleanup-members-edit"))
    expect(screen.queryByTestId("settings-cleanup-defaults-form")).not.toBeInTheDocument()
    expect(screen.getByTestId("settings-cleanup-members-form")).toBeInTheDocument()

    const event = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    await user.click(screen.getByTestId("cleanup-members-keeps"))
    const dirty = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)

    await user.click(screen.getByTestId("settings-cleanup-members-cancel"))
    await user.click(await screen.findByRole("button", { name: /^Discard/ }))
    await waitFor(() => expect(screen.queryByTestId("settings-cleanup-members-form")).not.toBeInTheDocument())
    await waitFor(() => {
      const clean = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(clean)
      expect(clean.defaultPrevented).toBe(false)
    })
  })
})
