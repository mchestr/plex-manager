/**
 * "Run all rules now?" (UX 8.6, 8.9, TS 9.5): its words with the read time,
 * the action, the toast, a refusal inside the dialog, and the button
 * without Redis.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { runCleanupNow } from "@/actions/admin/cleanup-settings"
import { RunAllButton, RunAllDialog } from "@/components/admin/cleanup/page/run-all-dialog"

jest.mock("@/actions/admin/cleanup-settings", () => ({ runCleanupNow: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const READ_AT = "2026-11-08T03:07:00.000Z"
const WORDS =
  "Reads no new library data. Each rule checks the library data from 3:07 AM today. New matches join Leaving soon, and rescues apply. A run never deletes: due items wait for the nightly run or your approval."

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(runCleanupNow).mockResolvedValue({ success: true, data: { queued: true } })
})

describe("RunAllDialog", () => {
  it("names the library data it checks, starts the run, toasts and closes", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<RunAllDialog dataFrom={READ_AT} now={NOW} open onOpenChange={onOpenChange} />)
    const dialog = screen.getByTestId("admin-cleanup-run-all-dialog")
    expect(dialog).toHaveTextContent("Run all rules now?")
    expect(dialog).toHaveTextContent(WORDS)
    await user.click(screen.getByTestId("admin-cleanup-run-all-confirm"))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(runCleanupNow).toHaveBeenCalledTimes(1)
    expect(mockShowSuccess).toHaveBeenCalledWith("Run started")
  })

  it("names older library data with its date, and the newest data before a first read", () => {
    const { rerender } = render(<RunAllDialog dataFrom="2026-11-05T03:07:00.000Z" now={NOW} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-run-all-dialog")).toHaveTextContent("Each rule checks the library data from Nov 5, 2026, 3:07 AM.")
    rerender(<RunAllDialog dataFrom={null} now={NOW} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-run-all-dialog")).toHaveTextContent("Reads no new library data. Each rule checks the newest library data.")
  })

  it("keeps a refusal inside the dialog", async () => {
    const user = userEvent.setup()
    jest.mocked(runCleanupNow).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    render(<RunAllDialog dataFrom={READ_AT} now={NOW} open onOpenChange={jest.fn()} />)
    await user.click(screen.getByTestId("admin-cleanup-run-all-confirm"))
    expect(await screen.findByText("A run is in progress. Try again in a few minutes.")).toBeInTheDocument()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})

describe("RunAllButton", () => {
  it("opens the dialog", async () => {
    const user = userEvent.setup()
    render(<RunAllButton redis dataFrom={READ_AT} now={NOW} />)
    await user.click(screen.getByTestId("admin-cleanup-settings-run-all"))
    expect(await screen.findByTestId("admin-cleanup-run-all-dialog")).toHaveTextContent(WORDS)
  })

  it("is disabled without Redis, keeps focus, says why and opens nothing", async () => {
    const user = userEvent.setup()
    render(<RunAllButton redis={false} dataFrom={READ_AT} now={NOW} data-testid="x-run-all" />)
    const button = screen.getByTestId("x-run-all")
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAccessibleDescription("Redis is not set up. Library reads and runs need the job queue.")
    await user.tab()
    expect(button).toHaveFocus()
    await user.click(button)
    expect(screen.queryByTestId("admin-cleanup-run-all-dialog")).not.toBeInTheDocument()
  })
})
