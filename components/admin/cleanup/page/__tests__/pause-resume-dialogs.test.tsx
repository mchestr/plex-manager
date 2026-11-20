/**
 * The pause and resume confirms (UX 8.6, 8.9, 4.0, TS 8.12): their words,
 * the hold date in the server zone, the actions, the toasts, the results
 * they pass on, a refusal inside the dialog, and the trigger buttons.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { pauseCleanup, resumeCleanup } from "@/actions/admin/cleanup-settings"
import { PauseButton, PauseDialog, ResumeButton, ResumeDialog } from "@/components/admin/cleanup/page/pause-resume-dialogs"
import { FormatProvider } from "@/lib/format-context"

jest.mock("@/actions/admin/cleanup-settings", () => ({ pauseCleanup: jest.fn(), resumeCleanup: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(pauseCleanup).mockResolvedValue({ success: true, data: { unapproved: 3 } })
  jest.mocked(resumeCleanup).mockResolvedValue({ success: true, data: { holdUntil: "2026-11-15" } })
})

describe("PauseDialog", () => {
  it("says what a pause does, pauses, toasts and passes the result on", async () => {
    const user = userEvent.setup()
    const onPaused = jest.fn()
    const onOpenChange = jest.fn()
    render(<PauseDialog open onOpenChange={onOpenChange} onPaused={onPaused} />)
    const dialog = screen.getByTestId("admin-cleanup-pause-dialog")
    expect(dialog).toHaveTextContent("Pause all cleanup?")
    expect(dialog).toHaveTextContent(
      "No run changes anything, and nothing is deleted. A deletion that has already started finishes, and no other starts. Approved batches go back to waiting for your approval. The Leaving soon collections in Plex empty, and members no longer see the Leaving soon page. Items keep their place and every Keep stays. After you resume, nothing is deleted for 7 days."
    )
    await user.click(screen.getByTestId("admin-cleanup-pause-confirm"))
    await waitFor(() => expect(onPaused).toHaveBeenCalledWith({ unapproved: 3 }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Cleanup paused")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps a failure inside the dialog", async () => {
    const user = userEvent.setup()
    jest.mocked(pauseCleanup).mockResolvedValueOnce({ success: false, code: "INTERNAL", error: "Could not pause cleanup. Try again." })
    render(<PauseDialog open onOpenChange={jest.fn()} />)
    await user.click(screen.getByTestId("admin-cleanup-pause-confirm"))
    expect(await screen.findByText("Could not pause cleanup. Try again.")).toBeInTheDocument()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})

describe("ResumeDialog", () => {
  it("names the end of the 7-day hold, resumes, toasts and passes the result on", async () => {
    const user = userEvent.setup()
    const onResumed = jest.fn()
    render(<ResumeDialog now={NOW} open onOpenChange={jest.fn()} onResumed={onResumed} />)
    const dialog = screen.getByTestId("admin-cleanup-resume-dialog")
    expect(dialog).toHaveTextContent("Resume cleanup?")
    expect(dialog).toHaveTextContent("Members see Leaving soon again. Nothing is deleted before Nov 15, 2026: items due earlier get that date.")
    await user.click(screen.getByTestId("admin-cleanup-resume-confirm"))
    await waitFor(() => expect(onResumed).toHaveBeenCalledWith({ holdUntil: "2026-11-15" }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Cleanup resumed")
  })

  it("counts the hold from today in the server zone", () => {
    render(
      <FormatProvider value={{ timeZone: "Pacific/Auckland", locale: "en-US" }}>
        <ResumeDialog now={NOW} open onOpenChange={jest.fn()} />
      </FormatProvider>
    )
    expect(screen.getByTestId("admin-cleanup-resume-dialog")).toHaveTextContent("Nothing is deleted before Nov 16, 2026")
  })

  it("keeps a refusal inside the dialog", async () => {
    const user = userEvent.setup()
    jest.mocked(resumeCleanup).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    render(<ResumeDialog now={NOW} open onOpenChange={jest.fn()} />)
    await user.click(screen.getByTestId("admin-cleanup-resume-confirm"))
    expect(await screen.findByText("A run is in progress. Try again in a few minutes.")).toBeInTheDocument()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})

describe("PauseButton and ResumeButton", () => {
  it("open their dialogs from the header buttons", async () => {
    const user = userEvent.setup()
    render(
      <>
        <PauseButton />
        <ResumeButton now={NOW} variant="outline" size="sm" data-testid="admin-cleanup-alert-paused-resume" />
      </>
    )
    expect(screen.getByTestId("admin-cleanup-pause")).toHaveTextContent("Pause all cleanup")
    await user.click(screen.getByTestId("admin-cleanup-pause"))
    expect(await screen.findByTestId("admin-cleanup-pause-dialog")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-pause-dialog")).not.toBeInTheDocument())
    await user.click(screen.getByTestId("admin-cleanup-alert-paused-resume"))
    expect(await screen.findByTestId("admin-cleanup-resume-dialog")).toBeInTheDocument()
  })

  it("names the resume button by its default id", () => {
    render(<ResumeButton now={NOW} />)
    expect(screen.getByTestId("admin-cleanup-resume")).toHaveTextContent("Resume cleanup")
  })
})
