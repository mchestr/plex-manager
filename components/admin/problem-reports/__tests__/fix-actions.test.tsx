/**
 * The admin's fixes on a report: the problem's own fix as a button, the rest
 * under Other fixes, each starting the run and saying how it went, with
 * Remove the file and search behind a confirm that says what it will do; and
 * the breaker banner's Resume fixes.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { removeProblemFile, resumeProblemFixes, runProblemFix, swapProblemCopy } from "@/actions/admin/problem-reports"
import { BreakerBanner } from "@/components/admin/problem-reports/breaker-banner"
import { FixActions } from "@/components/admin/problem-reports/fix-actions"

jest.mock("@/actions/admin/problem-reports", () => ({ runProblemFix: jest.fn(), resumeProblemFixes: jest.fn(), swapProblemCopy: jest.fn(), removeProblemFile: jest.fn() }))
jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

beforeEach(() => jest.clearAllMocks())

describe("FixActions", () => {
  it("runs the problem's own fix from its button", async () => {
    const user = userEvent.setup()
    jest.mocked(runProblemFix).mockResolvedValue({ success: true, data: null })
    render(<FixActions reportId="report-1" suggested="LOOK_FOR_MISSING" others={["REFRESH"]} />)

    await user.click(screen.getByTestId("admin-problem-report-fix-look-for-missing"))

    expect(runProblemFix).toHaveBeenCalledWith({ reportId: "report-1", action: "LOOK_FOR_MISSING" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Looking for the episodes")
  })

  it("offers the other fixes in a menu, and shows a refusal", async () => {
    const user = userEvent.setup()
    jest.mocked(runProblemFix).mockResolvedValue({ success: false, code: "CONFLICT", error: "This report is closed, or a fix is running on it." })
    render(<FixActions reportId="report-1" suggested={null} others={["REFRESH"]} />)

    expect(screen.queryByTestId("admin-problem-report-fix-look-for-missing")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("admin-problem-report-other-fixes"))
    await user.click(await screen.findByTestId("admin-problem-report-fix-refresh"))

    expect(runProblemFix).toHaveBeenCalledWith({ reportId: "report-1", action: "REFRESH" })
    expect(mockShowError).toHaveBeenCalledWith("This report is closed, or a fix is running on it.")
  })
})

describe("FixActions: the fixes that replace the file", () => {
  it("swaps the copy from the problem's own button", async () => {
    const user = userEvent.setup()
    jest.mocked(swapProblemCopy).mockResolvedValue({ success: true, data: null })
    render(<FixActions reportId="report-1" suggested="SWAP" others={["BETTER_COPY", "REFRESH", "REMOVE_AND_SEARCH"]} />)

    await user.click(screen.getByTestId("admin-problem-report-fix-swap"))

    expect(swapProblemCopy).toHaveBeenCalledWith({ reportId: "report-1" })
    expect(runProblemFix).not.toHaveBeenCalled()
    expect(mockShowSuccess).toHaveBeenCalledWith("Swapping the copy")
  })

  it("asks before removing the file, saying what it will do, and removes nothing on cancel", async () => {
    const user = userEvent.setup()
    render(<FixActions reportId="report-1" suggested="SWAP" others={["REMOVE_AND_SEARCH"]} removal={<p data-testid="facts">Radarr moves the file to its recycle bin.</p>} />)

    await user.click(screen.getByTestId("admin-problem-report-other-fixes"))
    await user.click(await screen.findByTestId("admin-problem-report-fix-remove-and-search"))

    const dialog = await screen.findByTestId("admin-problem-report-remove-dialog")
    expect(dialog).toHaveTextContent("The title is unavailable to everyone until a new copy downloads")
    expect(screen.getByTestId("facts")).toHaveTextContent("Radarr moves the file to its recycle bin.")
    await user.click(screen.getByRole("button", { name: "Cancel" }))

    expect(removeProblemFile).not.toHaveBeenCalled()
  })

  it("removes the file and searches once confirmed", async () => {
    const user = userEvent.setup()
    jest.mocked(removeProblemFile).mockResolvedValue({ success: true, data: null })
    render(<FixActions reportId="report-1" suggested={null} others={["SWAP", "REMOVE_AND_SEARCH"]} removal={null} />)

    await user.click(screen.getByTestId("admin-problem-report-other-fixes"))
    await user.click(await screen.findByTestId("admin-problem-report-fix-remove-and-search"))
    await user.click(await screen.findByTestId("admin-problem-report-remove-confirm"))

    expect(removeProblemFile).toHaveBeenCalledWith({ reportId: "report-1" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Looking for a new copy")
  })
})

describe("BreakerBanner", () => {
  it("says the replacing fixes are paused since when, and resumes them", async () => {
    const user = userEvent.setup()
    jest.mocked(resumeProblemFixes).mockResolvedValue({ success: true, data: null })
    render(<BreakerBanner since="Nov 9, 8:00 PM CST" />)

    expect(screen.getByTestId("admin-problem-breaker")).toHaveTextContent("Fixes that replace files are paused")
    expect(screen.getByTestId("admin-problem-breaker-timestamp")).toHaveTextContent("Nov 9, 8:00 PM CST")
    await user.click(screen.getByTestId("admin-problem-breaker-resume"))

    expect(resumeProblemFixes).toHaveBeenCalledWith({})
    expect(mockShowSuccess).toHaveBeenCalledWith("Fixes resumed")
  })

  it("shows a refusal", async () => {
    const user = userEvent.setup()
    jest.mocked(resumeProblemFixes).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not resume the fixes" })
    render(<BreakerBanner since="Nov 9" />)

    await user.click(screen.getByTestId("admin-problem-breaker-resume"))
    expect(mockShowError).toHaveBeenCalledWith("Could not resume the fixes")
  })
})
