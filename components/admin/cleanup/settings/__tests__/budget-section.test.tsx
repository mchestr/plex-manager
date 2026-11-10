/**
 * The Deletion budget and safety section (UX 4.10, 8.8, TS 3.3): the read
 * view with E17's budget line and the entry check line, Edit with the
 * ranges, the GB or TB unit, the changed-from lines, Save and Cancel.
 */

import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { updateCleanupSettings } from "@/actions/admin/cleanup-settings"
import { buildSettingsData } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { BudgetSection, checkBudget, sizeOf } from "@/components/admin/cleanup/settings/budget-section"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/actions/admin/cleanup-settings", () => ({ updateCleanupSettings: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

async function renderSection(options = buildOptions()) {
  await act(async () => {
    render(<BudgetSection data={buildSettingsData({}, options)} />)
  })
}

const summary = (key: string) => screen.getByTestId(`settings-cleanup-budget-summary-${key}`)
const VALID = { items: 20, size: 500, unit: "GB" as const, entryCount: 50, entryPercent: 10, automaticGrace: 7 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(updateCleanupSettings).mockResolvedValue({ success: true, data: { exitsApplied: null } })
})

describe("BudgetSection read view", () => {
  it("shows the budget, the order, the entry check, the grace period, the hold and typed approval", async () => {
    await renderSection()

    expect(screen.getByRole("heading", { name: "Deletion budget and safety" })).toBeInTheDocument()
    expect(summary("budget")).toHaveTextContent("At most 20 items a day. At most 500 GB a day, but one title that is larger goes alone on its own day")
    expect(summary("order")).toHaveTextContent("Oldest leave date first, then the largest. A show goes after its seasons")
    expect(summary("entry")).toHaveTextContent("A run that adds more than 50 items, or more than 10 % of the items checked, adds none and asks you")
    expect(summary("automatic-grace")).toHaveTextContent("7 days")
    expect(summary("hold")).toHaveTextContent("Nothing is deleted for 7 days after you resume")
    expect(summary("typed")).toHaveTextContent("To approve more than 50 deletions, or to turn on Automatic for more than 50 items")
  })

  it("reads a budget of 2 TB in TB", async () => {
    await renderSection(buildOptions({ budget: { items: 1, bytes: 2 * TiB } }))
    expect(summary("budget")).toHaveTextContent("At most 1 item a day. At most 2 TB a day")
  })
})

describe("sizeOf and checkBudget", () => {
  it("reads bytes in GB below 1 TB and in TB from 1 TB", () => {
    expect(sizeOf(500 * GiB)).toEqual({ amount: 500, unit: "GB" })
    expect(sizeOf(1.5 * TiB)).toEqual({ amount: 1.5, unit: "TB" })
  })

  it("checks each range of TS 3.3", () => {
    expect(checkBudget(VALID)).toEqual({
      input: { section: "cleanup-budget", values: { items: 20, bytes: 500 * GiB, entryCheck: { count: 50, percent: 10 }, automaticMinGraceDays: 7 } },
    })
    expect(checkBudget({ ...VALID, items: 501, size: 51, unit: "TB", entryCount: 0, entryPercent: 101, automaticGrace: 6 })).toEqual({
      errors: {
        items: "Enter a whole number of items from 1 to 500.",
        size: "Enter a size from 1 GB to 50 TB.",
        entryCount: "Enter a whole number of items from 1 to 1000.",
        entryPercent: "Enter a whole percent from 1 to 100.",
        automaticGrace: "Enter a whole number of days from 7 to 3650.",
      },
    })
    expect(checkBudget({ ...VALID, size: null })).toEqual({ errors: { size: "Enter a size from 1 GB to 50 TB." } })
    expect(checkBudget({ ...VALID, size: 0.5 })).toEqual({ errors: { size: "Enter a size from 1 GB to 50 TB." } })
  })
})

describe("BudgetSection edit", () => {
  it("labels each field, shows what changed, and saves only the budget values", async () => {
    const user = userEvent.setup()
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-budget-edit"))

    expect(screen.getByRole("textbox", { name: "Most items deleted in one day" })).toHaveAttribute("data-testid", "cleanup-budget-items")
    expect(screen.getByRole("textbox", { name: "Most space deleted in one day" })).toHaveAttribute("data-testid", "cleanup-budget-bytes")
    expect(screen.getByRole("textbox", { name: "Items in one run" })).toHaveAttribute("data-testid", "cleanup-budget-entry-count")
    expect(screen.getByRole("textbox", { name: "Percent of the items checked" })).toHaveAttribute("data-testid", "cleanup-budget-entry-percent")
    expect(screen.getByRole("group", { name: "Hold new matches for my approval above" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Shortest grace period for Automatic" })).toHaveAttribute("data-testid", "cleanup-budget-automatic-grace")

    const items = screen.getByTestId("cleanup-budget-items")
    await user.clear(items)
    await user.type(items, "40")
    expect(screen.getByText("Changed from 20 items.")).toBeInTheDocument()
    await user.click(screen.getByTestId("cleanup-budget-bytes-unit-tb"))
    await user.clear(screen.getByTestId("cleanup-budget-bytes"))
    await user.type(screen.getByTestId("cleanup-budget-bytes"), "2")
    expect(screen.getByText("Changed from 500 GB.")).toBeInTheDocument()
    await user.clear(screen.getByTestId("cleanup-budget-entry-percent"))
    await user.type(screen.getByTestId("cleanup-budget-entry-percent"), "20")
    expect(screen.getByText("Changed from 50 items, or 10 %.")).toBeInTheDocument()
    await user.clear(screen.getByTestId("cleanup-budget-automatic-grace"))
    await user.type(screen.getByTestId("cleanup-budget-automatic-grace"), "14")
    expect(screen.getByText("Changed from 7 days.")).toBeInTheDocument()
    await user.click(screen.getByTestId("settings-cleanup-budget-save"))

    expect(updateCleanupSettings).toHaveBeenCalledWith({
      section: "cleanup-budget",
      values: { items: 40, bytes: 2 * TiB, entryCheck: { count: 50, percent: 20 }, automaticMinGraceDays: 14 },
    })
    expect(mockShowSuccess).toHaveBeenCalledWith("Settings saved")
  })

  it("shows the range errors and saves nothing until they are fixed", async () => {
    const user = userEvent.setup()
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-budget-edit"))

    await user.clear(screen.getByTestId("cleanup-budget-items"))
    await user.clear(screen.getByTestId("cleanup-budget-bytes"))
    await user.clear(screen.getByTestId("cleanup-budget-entry-count"))
    await user.clear(screen.getByTestId("cleanup-budget-entry-percent"))
    await user.clear(screen.getByTestId("cleanup-budget-automatic-grace"))
    expect(screen.getByTestId("cleanup-budget-items-error")).toHaveTextContent("Enter a whole number of items from 1 to 500.")
    expect(screen.getByTestId("cleanup-budget-bytes-error")).toHaveTextContent("Enter a size from 1 GB to 50 TB.")
    expect(screen.getByTestId("cleanup-budget-entry-count-error")).toHaveTextContent("Enter a whole number of items from 1 to 1000.")
    expect(screen.getByTestId("cleanup-budget-entry-percent-error")).toHaveTextContent("Enter a whole percent from 1 to 100.")
    expect(screen.getByTestId("cleanup-budget-automatic-grace-error")).toHaveTextContent("Enter a whole number of days from 7 to 3650.")
    await user.click(screen.getByTestId("settings-cleanup-budget-save"))
    expect(updateCleanupSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId("cleanup-budget-items")).toHaveFocus())
  })

  it("keeps the form open on a refusal, and Cancel with no change closes it", async () => {
    const user = userEvent.setup()
    jest.mocked(updateCleanupSettings).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "Someone else saved settings at the same time. Try again." })
    await renderSection()
    await user.click(screen.getByTestId("settings-cleanup-budget-edit"))
    await user.click(screen.getByTestId("cleanup-budget-items-increment"))
    await user.click(screen.getByTestId("settings-cleanup-budget-save"))
    expect(mockShowError).toHaveBeenCalledWith("Someone else saved settings at the same time. Try again.")

    await user.click(screen.getByTestId("cleanup-budget-items-decrement"))
    await user.click(screen.getByTestId("settings-cleanup-budget-cancel"))
    expect(screen.queryByTestId("settings-cleanup-budget-form")).not.toBeInTheDocument()
  })
})
