/**
 * The Privacy section (P11.14): the retention windows, the last run with its
 * counts, and the audited "Run now".
 */

import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runRetentionNow } from "@/actions/admin/retention"
import { PrivacySection } from "@/components/admin/settings/sections/privacy-section"
import { RETENTION_RULES, retentionDays, retentionPolicy, type RetentionRule } from "@/lib/retention/policy"

jest.mock("@/actions/admin/retention", () => ({ runRetentionNow: jest.fn() }))

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const POLICY = retentionPolicy(retentionDays({}))

beforeEach(() => jest.clearAllMocks())
afterEach(() => jest.useRealTimers())

describe("PrivacySection", () => {
  it("lists every window", () => {
    render(<PrivacySection status={{ policy: POLICY, lastRun: null }} />)

    const table = screen.getByTestId("settings-retention-windows")
    expect(within(table).getAllByRole("row")).toHaveLength(POLICY.length + 1)
    const rewindText = screen.getByTestId("settings-retention-rewindLlmText")
    expect(rewindText).toHaveTextContent("Rewind AI prompts and replies")
    expect(rewindText).toHaveTextContent("120 days")
    expect(screen.getByTestId("settings-retention-auditLog")).toHaveTextContent("400 days")
    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Not run yet.")
  })

  it("shows the last run and its count per rule", () => {
    render(
      <PrivacySection status={{ policy: POLICY, lastRun: { at: "2027-02-01T03:30:00.000Z", counts: { auditLog: 12, rewindViews: 4 } } }} />
    )

    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Last run")
    expect(screen.getByTestId("settings-retention-count-auditLog")).toHaveTextContent("12")
    expect(screen.getByTestId("settings-retention-count-rewindViews")).toHaveTextContent("4")
    expect(screen.getByTestId("settings-retention-count-discordCommandLog")).toHaveTextContent("0")
  })

  it("runs the sweep now and shows the new counts", async () => {
    const user = userEvent.setup()
    jest.mocked(runRetentionNow).mockResolvedValue({
      success: true,
      data: {
        counts: { ...(Object.fromEntries(RETENTION_RULES.map((rule) => [rule, 0])) as Record<RetentionRule, number>), rewindLlmText: 7 },
        queued: false,
        partial: false,
        finishedAt: "2027-02-02T10:00:00.000Z",
      },
    })
    render(<PrivacySection status={{ policy: POLICY, lastRun: null }} />)

    await user.click(screen.getByTestId("settings-retention-run"))

    expect(runRetentionNow).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId("settings-retention-count-rewindLlmText")).toHaveTextContent("7")
    expect(mockShowSuccess).toHaveBeenCalledWith("Retention sweep finished. 7 rows removed or cleared.")
  })

  it("shows the error when the run fails", async () => {
    const user = userEvent.setup()
    jest.mocked(runRetentionNow).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not run the retention sweep" })
    render(<PrivacySection status={{ policy: POLICY, lastRun: null }} />)

    await user.click(screen.getByTestId("settings-retention-run"))

    expect(mockShowError).toHaveBeenCalledWith("Could not run the retention sweep")
    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Not run yet.")
  })

  it("shows a queued sweep and refreshes until the recorded run changes", async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    jest.mocked(runRetentionNow).mockResolvedValue({ success: true, data: { queued: true } })
    const before = { at: "2027-02-01T03:30:00.000Z", counts: { auditLog: 1 } }
    const { rerender } = render(<PrivacySection status={{ policy: POLICY, lastRun: before }} />)

    await user.click(screen.getByTestId("settings-retention-run"))

    expect(mockShowSuccess).toHaveBeenCalledWith("Retention sweep queued. The counts update here when it finishes.")
    expect(await screen.findByText("Sweep queued. The counts update here when it finishes.")).toHaveAttribute(
      "data-testid",
      "settings-retention-last-run"
    )
    act(() => jest.advanceTimersByTime(5000))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    rerender(<PrivacySection status={{ policy: POLICY, lastRun: { at: "2027-02-02T10:00:00.000Z", counts: { auditLog: 9 } } }} />)

    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Last run")
    expect(screen.getByTestId("settings-retention-count-auditLog")).toHaveTextContent("9")
    act(() => jest.advanceTimersByTime(10_000))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("reports a partial inline sweep without recording it as the last run", async () => {
    const user = userEvent.setup()
    jest.mocked(runRetentionNow).mockResolvedValue({
      success: true,
      data: {
        counts: { ...(Object.fromEntries(RETENTION_RULES.map((rule) => [rule, 0])) as Record<RetentionRule, number>), auditLog: 1000 },
        queued: false,
        partial: true,
        finishedAt: "2027-02-02T10:00:20.000Z",
      },
    })
    render(<PrivacySection status={{ policy: POLICY, lastRun: null }} />)

    await user.click(screen.getByTestId("settings-retention-run"))

    expect(mockShowSuccess).toHaveBeenCalledWith(
      "Retention sweep stopped after 20 seconds with 1000 rows removed or cleared. The next run finishes it."
    )
    expect(screen.getByTestId("settings-retention-last-run")).toHaveTextContent("Not run yet.")
  })
})
