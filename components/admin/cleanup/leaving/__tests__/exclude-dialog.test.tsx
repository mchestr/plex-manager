/**
 * The Exclude dialog (UX 8.6, TS 10.3, E37): the words for one named title
 * and for many, Until with no end date or a date, the note, the pending
 * label, errors in the open dialog, the toasts, a batch target with the
 * stale and the conflict close, and the focus after each close.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"

import { excludeCleanupItems } from "@/actions/admin/cleanup-items"
import { ExcludeDialog, type ExcludeDialogProps } from "@/components/admin/cleanup/leaving/exclude-dialog"
import { Button } from "@/components/ui/button"

jest.mock("@/actions/admin/cleanup-items", () => ({ excludeCleanupItems: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const NOW = Date.parse("2026-11-08T12:00:00Z")
const BATCH = { batchId: "deletion-rule-1", count: 6, keysHash: "c".repeat(64), excludeKeys: [], selectedCount: 6 }
const onDone = jest.fn()
const onStale = jest.fn()

function Harness(props: Partial<ExcludeDialogProps> & Pick<ExcludeDialogProps, "target">) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        Batch card
      </h2>
      <Button onClick={() => setOpen(true)} data-testid="open-exclude">
        Exclude...
      </Button>
      <ExcludeDialog open={open} onOpenChange={setOpen} onDone={onDone} onStale={onStale} successFocus={heading} {...props} />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, props: Partial<ExcludeDialogProps> & Pick<ExcludeDialogProps, "target">) {
  render(<Harness {...props} />)
  await user.click(screen.getByTestId("open-exclude"))
  return screen.findByTestId("admin-cleanup-exclude-dialog")
}

const closed = () => waitFor(() => expect(screen.queryByTestId("admin-cleanup-exclude-dialog")).not.toBeInTheDocument())
const confirm = () => screen.getByTestId("admin-cleanup-exclude-confirm")

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 1, skipped: 0 } })
})

afterEach(() => jest.restoreAllMocks())

describe("ExcludeDialog", () => {
  it("names one title, excludes it with no end date by default, toasts by its level and moves focus to the target", async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user, { target: { itemKeys: ["movie:tmdb:1"], title: "Invented Movie", level: "movie" } })
    expect(within(dialog).getByRole("heading", { name: "Exclude Invented Movie from cleanup?" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent("Every rule skips it until the end date. If it is in Leaving soon, it leaves at once.")
    expect(dialog).toHaveTextContent("Only admins see the note.")
    expect(within(screen.getByTestId("admin-cleanup-exclude-until")).getByRole("radio", { name: "No end date" })).toBeChecked()
    expect(screen.queryByTestId("admin-cleanup-exclude-date")).not.toBeInTheDocument()
    expect(confirm()).toHaveTextContent("Exclude Invented Movie")
    await user.click(confirm())
    await closed()
    expect(excludeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["movie:tmdb:1"], until: null })
    expect(mockShowSuccess).toHaveBeenCalledWith("Movie excluded.")
    expect(onDone).toHaveBeenCalledWith({ excluded: 1, rescued: 1, skipped: 0 })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Batch card" })).toHaveFocus())
  })

  it("sends an end date and a trimmed note, and refuses no date or a past date in the open dialog", async () => {
    const user = userEvent.setup()
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1", "movie:tmdb:2"] } })
    expect(screen.getByRole("heading", { name: "Exclude 2 titles from cleanup?" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-exclude-dialog")).toHaveTextContent("Every rule skips them until the end date.")
    await user.click(within(screen.getByTestId("admin-cleanup-exclude-until")).getByRole("radio", { name: "A date" }))
    const date = screen.getByTestId("admin-cleanup-exclude-date")
    expect(date).toHaveAttribute("min", "2026-11-08")
    await user.click(confirm())
    expect(await screen.findByText("Choose an end date.")).toBeInTheDocument()
    await user.type(date, "2026-11-01")
    await user.click(confirm())
    expect(await screen.findByText("Choose today or a later date.")).toBeInTheDocument()
    await user.clear(date)
    await user.type(date, "2026-12-24")
    await user.type(screen.getByTestId("admin-cleanup-exclude-note"), "  Rewatch in spring ")
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: true, data: { excluded: 1, rescued: 0, skipped: 1 } })
    await user.click(confirm())
    await closed()
    expect(excludeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], until: "2026-12-24", note: "Rewatch in spring" })
    expect(mockShowSuccess).toHaveBeenCalledWith("1 title excluded. 1 is being deleted and was skipped.")
  })

  it("toasts an error when nothing was excluded, in the words for one title of a batch", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: true, data: { excluded: 0, rescued: 0, skipped: 1 } })
    await openDialog(user, { target: { batch: { ...BATCH, selectedCount: 1 } } })
    expect(screen.getByRole("heading", { name: "Exclude 1 title from cleanup?" })).toBeInTheDocument()
    await user.click(confirm())
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("This title is being deleted. Nothing was excluded."))
  })

  it("shows the pending label, and keeps an error of the action in the open dialog", async () => {
    const user = userEvent.setup()
    let settle: (value: Awaited<ReturnType<typeof excludeCleanupItems>>) => void = () => {}
    jest.mocked(excludeCleanupItems).mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)))
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1"], title: "Invented Movie" } })
    await user.click(confirm())
    expect(await screen.findByText("Excluding")).toBeInTheDocument()
    settle({ success: false, code: "CLEANUP_DELETING", error: "This title, or part of it, is being deleted now. Try again in a few minutes." })
    expect(await screen.findByText("This title, or part of it, is being deleted now. Try again in a few minutes.")).toBeInTheDocument()
    expect(onStale).not.toHaveBeenCalled()
  })

  it("sends the batch form, starts again with no end date when it opens again, and counts many titles in the toast", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: true, data: { excluded: 6, rescued: 6, skipped: 0 } })
    await openDialog(user, { target: { batch: BATCH } })
    expect(screen.getByRole("heading", { name: "Exclude 6 titles from cleanup?" })).toBeInTheDocument()
    await user.click(within(screen.getByTestId("admin-cleanup-exclude-until")).getByRole("radio", { name: "A date" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await closed()
    await user.click(screen.getByTestId("open-exclude"))
    await screen.findByTestId("admin-cleanup-exclude-dialog")
    expect(screen.queryByTestId("admin-cleanup-exclude-date")).not.toBeInTheDocument()
    await user.click(confirm())
    await closed()
    expect(excludeCleanupItems).toHaveBeenCalledWith({ batch: BATCH, until: null })
    expect(mockShowSuccess).toHaveBeenCalledWith("6 titles excluded.")
  })

  it("closes on a stale batch or a CONFLICT, calls onStale and gives focus back to its opener", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    await openDialog(user, { target: { batch: BATCH } })
    await user.click(confirm())
    await closed()
    expect(onStale).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId("open-exclude")).toHaveFocus())
    const error = "Someone else changed these titles at the same time. Try again."
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: false, code: "CONFLICT", error })
    await user.click(screen.getByTestId("open-exclude"))
    await user.click(await screen.findByTestId("admin-cleanup-exclude-confirm"))
    await closed()
    expect(mockShowError).toHaveBeenCalledWith(error)
    expect(onStale).toHaveBeenCalledTimes(2)
  })
})
