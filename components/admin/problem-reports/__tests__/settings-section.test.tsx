/**
 * The Problem reports settings card: the switch and members' swaps as a
 * summary, then the form. On stays disabled while Radarr or Sonarr has no
 * recycle bin, and a limit out of range stops the save on its field.
 */

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Suspense } from "react"

import { updateProblemReportSettings } from "@/actions/admin/problem-reports"
import { ProblemReportSettingsSection } from "@/components/admin/problem-reports/settings-section"

jest.mock("@/actions/admin/problem-reports", () => ({ updateProblemReportSettings: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SAVED = { enabled: true, automatic: "OFF" as const, weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10 }

async function renderSection(missing: ("Radarr" | "Sonarr")[] = [], saved = SAVED) {
  const bins = Promise.resolve(missing)
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <ProblemReportSettingsSection saved={saved} recycleBins={bins} />
      </Suspense>
    )
  })
}

beforeEach(() => jest.clearAllMocks())

it("summarises the switch, members' swaps and their limits", async () => {
  await renderSection()

  expect(screen.getByTestId("settings-problem-reports-summary-automatic")).toHaveTextContent("Off")
  expect(screen.getByTestId("settings-problem-reports-summary-limits")).toHaveTextContent("3 per member in any 7 days, a title every 14 days, 10 a day in all")
})

it("keeps On disabled, and says why, while Sonarr has no recycle bin", async () => {
  const user = userEvent.setup()
  await renderSection(["Sonarr"])

  await user.click(screen.getByTestId("settings-problem-reports-edit"))

  expect(screen.getByTestId("admin-problem-reports-recycle-bin")).toHaveTextContent("On needs a recycle bin in Sonarr, so a bad swap can be undone.")
  expect(screen.getByTestId("admin-problem-reports-automatic-on")).toHaveAttribute("data-disabled")
  expect(screen.getByTestId("admin-problem-reports-automatic-dry_run")).not.toHaveAttribute("data-disabled")
})

it("saves Dry run with new limits", async () => {
  const user = userEvent.setup()
  jest.mocked(updateProblemReportSettings).mockResolvedValue({ success: true, data: null })
  await renderSection()

  await user.click(screen.getByTestId("settings-problem-reports-edit"))
  await user.click(screen.getByTestId("admin-problem-reports-automatic-dry_run"))
  await user.clear(screen.getByTestId("admin-problem-reports-weeklySwaps"))
  await user.type(screen.getByTestId("admin-problem-reports-weeklySwaps"), "2")
  await user.click(screen.getByTestId("settings-problem-reports-save"))

  expect(updateProblemReportSettings).toHaveBeenCalledWith({ enabled: true, automatic: "DRY_RUN", weeklySwaps: 2, titleCooldownDays: 14, dailySwapCap: 10 })
  expect(mockShowSuccess).toHaveBeenCalledWith("Problem report settings saved")
})

it("stops the save on a limit out of range", async () => {
  const user = userEvent.setup()
  await renderSection()

  await user.click(screen.getByTestId("settings-problem-reports-edit"))
  await user.clear(screen.getByTestId("admin-problem-reports-dailySwapCap"))
  await user.type(screen.getByTestId("admin-problem-reports-dailySwapCap"), "500")
  await user.click(screen.getByTestId("settings-problem-reports-save"))

  expect(await screen.findByText("Enter a whole number from 1 to 100")).toBeInTheDocument()
  expect(updateProblemReportSettings).not.toHaveBeenCalled()
})
