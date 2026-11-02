/**
 * The Conversation review section: a summary of the nightly sweep, its
 * sample rate and minimum turns, and the judge's daily budget until Edit
 * swaps in the fields, a save through saveJudgeSettings, and a save whose
 * schedule did not move treated as saved.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { saveJudgeSettings } from "@/actions/admin/judge-settings"
import { JudgeNightlySection, type JudgeSettings } from "@/components/admin/settings/sections/judge-nightly-section"
import { SettingsEditProvider } from "@/components/ui/settings-edit-context"

jest.mock("@/actions/admin/judge-settings", () => ({ saveJudgeSettings: jest.fn() }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const mockSave = jest.mocked(saveJudgeSettings)

const SAVED: JudgeSettings = { judgeNightlyEnabled: false, judgeSampleRate: 100, judgeMinTurns: 2, llmDailyCapJudgeUsd: 1 }

function renderSection(saved: JudgeSettings = SAVED) {
  return render(
    <SettingsEditProvider onDirtyChange={jest.fn()}>
      <JudgeNightlySection saved={saved} />
    </SettingsEditProvider>
  )
}

const summaryRow = (key: string) => screen.getByTestId(`settings-conversation-review-summary-${key}`)

async function edit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("settings-conversation-review-edit"))
  await waitFor(() => expect(screen.getByTestId("judge-nightly-toggle")).toBeEnabled())
}

beforeEach(() => jest.clearAllMocks())

describe("JudgeNightlySection", () => {
  it("Conversation review section shows read-only summary first, edits, and calls saveJudgeSettings", async () => {
    mockSave.mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    renderSection()

    expect(screen.getByRole("heading", { name: "Conversation review" })).toBeInTheDocument()
    expect(summaryRow("nightly")).toHaveTextContent("Off")
    expect(summaryRow("sample-rate")).toHaveTextContent("100%")
    expect(summaryRow("min-turns")).toHaveTextContent("2")
    expect(summaryRow("budget")).toHaveTextContent("$1.00 a day")
    expect(screen.queryByTestId("judge-nightly-toggle")).not.toBeInTheDocument()

    await edit(user)
    await user.click(screen.getByTestId("judge-nightly-toggle"))
    const slider = screen.getByRole("slider", { name: "Sample rate" })
    slider.focus()
    await user.keyboard("{Home}{ArrowRight}{ArrowRight}")
    await user.clear(screen.getByTestId("judge-min-turns"))
    await user.type(screen.getByTestId("judge-min-turns"), "4")
    await user.clear(screen.getByTestId("judge-daily-budget"))
    await user.type(screen.getByTestId("judge-daily-budget"), "2.5")
    await user.click(screen.getByTestId("settings-conversation-review-save"))

    expect(mockSave).toHaveBeenCalledWith({ judgeNightlyEnabled: true, judgeSampleRate: 2, judgeMinTurns: 4, llmDailyCapJudgeUsd: 2.5 })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Conversation review settings saved"))
    expect(await screen.findByTestId("settings-conversation-review-summary")).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()
  })

  it('the daily budget help text reads "Covers manual and nightly reviews. A review already running can finish past it."', async () => {
    const user = userEvent.setup()
    renderSection()

    await edit(user)

    expect(screen.getByTestId("judge-daily-budget")).toHaveAccessibleDescription("Covers manual and nightly reviews. A review already running can finish past it.")
    expect(screen.getByTestId("judge-sample-rate")).toHaveTextContent("The sample rate applies to each changed conversation, each night.")
  })

  it("rejects sample rate 101", async () => {
    mockSave.mockResolvedValue({ success: true, data: null })
    const user = userEvent.setup()
    renderSection({ ...SAVED, judgeSampleRate: 40 })

    await edit(user)
    const slider = screen.getByRole("slider", { name: "Sample rate" })
    expect(slider).toHaveAttribute("aria-valuetext", "40%")
    slider.focus()
    await user.keyboard("{End}{ArrowRight}")

    expect(slider).toHaveAttribute("aria-valuenow", "100")
    await user.click(screen.getByTestId("settings-conversation-review-save"))
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ judgeSampleRate: 100 }))
  })

  it("stops a save with fewer than one minimum turn or a blank budget, on their fields", async () => {
    const user = userEvent.setup()
    renderSection()

    await edit(user)
    await user.clear(screen.getByTestId("judge-min-turns"))
    await user.type(screen.getByTestId("judge-min-turns"), "0")
    await user.clear(screen.getByTestId("judge-daily-budget"))
    await user.click(screen.getByTestId("settings-conversation-review-save"))

    expect(await screen.findByText("Enter a whole number from 1 to 50")).toBeInTheDocument()
    expect(screen.getByText("Enter an amount from 0 to 1000")).toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
    expect(screen.getByTestId("settings-conversation-review-form")).toBeInTheDocument()
  })

  it("shows the action's field error on its field and stays in edit mode", async () => {
    mockSave.mockResolvedValue({ success: false, code: "VALIDATION", error: "Invalid input", fieldErrors: { judgeMinTurns: ["Too big"] } })
    const user = userEvent.setup()
    renderSection()

    await edit(user)
    await user.clear(screen.getByTestId("judge-min-turns"))
    await user.type(screen.getByTestId("judge-min-turns"), "5")
    await user.click(screen.getByTestId("settings-conversation-review-save"))

    expect(await screen.findByText("Too big")).toBeInTheDocument()
    expect(screen.getByTestId("settings-conversation-review-form")).toBeInTheDocument()
    expect(mockShowError).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it("treats a save whose schedule did not move as saved, with the queue's message", async () => {
    const user = userEvent.setup()
    const message = "Settings saved, but the job queue did not answer, so the schedule was not updated. The worker updates it the next time it starts."
    mockSave.mockResolvedValue({ success: false, code: "UPSTREAM_UNAVAILABLE", error: message })
    renderSection()

    await edit(user)
    await user.click(screen.getByTestId("judge-nightly-toggle"))
    await user.click(screen.getByTestId("settings-conversation-review-save"))

    expect(await screen.findByTestId("settings-conversation-review-summary")).toBeInTheDocument()
    expect(mockShowError).toHaveBeenCalledWith(message)
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(screen.queryByTestId("judge-settings-error")).not.toBeInTheDocument()
  })
})
