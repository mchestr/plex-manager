/**
 * The Postpone dialog (UX 8.6, TS 10.3, E37): the chips and Other, the new
 * leave date line for one date, several dates, a batch and a season, the
 * pending label, errors in the open dialog, the toasts, a batch target with
 * the stale and the conflict close, and the focus after each close.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"

import { postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { PostponeDialog, type PostponeDialogProps } from "@/components/admin/cleanup/leaving/postpone-dialog"
import { Button } from "@/components/ui/button"

jest.mock("@/actions/admin/cleanup-items", () => ({ postponeCleanupItems: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const NOW = Date.parse("2026-11-08T12:00:00Z")
const BATCH = { batchId: "deletion-rule-1", count: 60, keysHash: "b".repeat(64), excludeKeys: ["movie:tmdb:55"], selectedCount: 59 }
const onDone = jest.fn()
const onStale = jest.fn()

function Harness(props: Partial<PostponeDialogProps> & Pick<PostponeDialogProps, "target">) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        Everything in Leaving soon
      </h2>
      <Button onClick={() => setOpen(true)} data-testid="open-postpone">
        Postpone...
      </Button>
      <PostponeDialog open={open} onOpenChange={setOpen} onDone={onDone} onStale={onStale} successFocus={heading} {...props} />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, props: Partial<PostponeDialogProps> & Pick<PostponeDialogProps, "target">) {
  render(<Harness {...props} />)
  await user.click(screen.getByTestId("open-postpone"))
  return screen.findByTestId("admin-cleanup-postpone-dialog")
}

const closed = () => waitFor(() => expect(screen.queryByTestId("admin-cleanup-postpone-dialog")).not.toBeInTheDocument())
const confirm = () => screen.getByTestId("admin-cleanup-postpone-confirm")
const dateLine = () => screen.getByTestId("admin-cleanup-postpone-date")

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 2, skipped: 0, firstLeaveOn: "2026-11-15", lastLeaveOn: "2026-11-30" } })
})

afterEach(() => jest.restoreAllMocks())

describe("PostponeDialog", () => {
  it("names the count, starts at 7 days and shows the new dates of titles with different leave dates", async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user, { target: { itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], leaveOns: ["2026-11-01", "2026-11-23"] } })
    expect(within(dialog).getByRole("heading", { name: "Postpone 2 titles?" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent("Their leave date moves later. It never moves earlier. Members see the new date.")
    expect(screen.getByTestId("admin-cleanup-postpone-preset-7")).toBeChecked()
    expect(dateLine()).toHaveTextContent("Each leave date moves 7 days later. New leave dates: Nov 15 to Nov 30, 2026.")
    await user.click(screen.getByTestId("admin-cleanup-postpone-preset-30"))
    expect(dateLine()).toHaveTextContent("Each leave date moves 30 days later. New leave dates: Dec 8 to Dec 23, 2026.")
    expect(confirm()).toHaveTextContent("Postpone 2 titles")
  })

  it("shows one date for equal dates, names the year of each date across a year end, and says the show moves with a season", async () => {
    const user = userEvent.setup()
    await openDialog(user, { target: { itemKeys: ["season:tvdb:9:1"], leaveOns: [null], seasons: true } })
    expect(screen.getByRole("heading", { name: "Postpone 1 title?" })).toBeInTheDocument()
    expect(dateLine()).toHaveTextContent("New leave date: Nov 15, 2026. The whole show moves with it.")
    await user.click(screen.getByTestId("admin-cleanup-postpone-preset-other"))
    expect(screen.queryByTestId("admin-cleanup-postpone-date")).not.toBeInTheDocument()
    await user.type(screen.getByTestId("admin-cleanup-postpone-days"), "1")
    expect(dateLine()).toHaveTextContent("New leave date: Nov 9, 2026.")
  })

  it("names both years when the dates cross a year end", async () => {
    const user = userEvent.setup()
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], leaveOns: ["2026-12-20", "2027-01-10"] } })
    expect(dateLine()).toHaveTextContent("New leave dates: Dec 27, 2026 to Jan 17, 2027.")
  })

  it("postpones the keys by the chosen days, toasts, tells the owner and moves focus to its target", async () => {
    const user = userEvent.setup()
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], leaveOns: [null, null] } })
    await user.click(screen.getByTestId("admin-cleanup-postpone-preset-14"))
    await user.click(confirm())
    await closed()
    expect(postponeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], days: 14 })
    expect(mockShowSuccess).toHaveBeenCalledWith("2 titles postponed.")
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ postponed: 2 }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Everything in Leaving soon" })).toHaveFocus())
  })

  it("counts the skipped titles in the toast, and toasts an error when nothing moved", async () => {
    const user = userEvent.setup()
    jest.mocked(postponeCleanupItems).mockResolvedValueOnce({ success: true, data: { postponed: 1, skipped: 1, firstLeaveOn: "2026-11-15", lastLeaveOn: "2026-11-15" } })
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1", "movie:tmdb:2"], leaveOns: [null, null] } })
    await user.click(confirm())
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("1 title postponed. 1 is being deleted and was skipped."))
    jest.mocked(postponeCleanupItems).mockResolvedValueOnce({ success: true, data: { postponed: 0, skipped: 2, firstLeaveOn: null, lastLeaveOn: null } })
    await user.click(screen.getByTestId("open-postpone"))
    await user.click(await screen.findByTestId("admin-cleanup-postpone-confirm"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("These titles are being deleted. Nothing was postponed."))
  })

  it("asks for a whole number of days for Other, and keeps an error of the action in the open dialog", async () => {
    const user = userEvent.setup()
    let settle: (value: Awaited<ReturnType<typeof postponeCleanupItems>>) => void = () => {}
    await openDialog(user, { target: { itemKeys: ["movie:tmdb:1"], leaveOns: [null] } })
    await user.click(screen.getByTestId("admin-cleanup-postpone-preset-other"))
    await user.click(confirm())
    expect(await screen.findByText("Enter a whole number of days from 1 to 3650.")).toBeInTheDocument()
    expect(postponeCleanupItems).not.toHaveBeenCalled()
    await user.type(screen.getByTestId("admin-cleanup-postpone-days"), "10")
    jest.mocked(postponeCleanupItems).mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)))
    await user.click(confirm())
    expect(await screen.findByText("Postponing")).toBeInTheDocument()
    settle({ success: false, code: "CLEANUP_DELETING", error: "This title, or part of it, is being deleted now. Try again in a few minutes." })
    expect(await screen.findByText("This title, or part of it, is being deleted now. Try again in a few minutes.")).toBeInTheDocument()
    expect(postponeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["movie:tmdb:1"], days: 10 })
    expect(onStale).not.toHaveBeenCalled()
  })

  it("sends the batch form for a batch target with one new date, and starts again at 7 days when it opens again", async () => {
    const user = userEvent.setup()
    await openDialog(user, { target: { batch: BATCH } })
    expect(screen.getByRole("heading", { name: "Postpone 59 titles?" })).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-postpone-preset-30"))
    expect(dateLine()).toHaveTextContent("New leave date: Dec 8, 2026.")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await closed()
    await user.click(screen.getByTestId("open-postpone"))
    await screen.findByTestId("admin-cleanup-postpone-dialog")
    expect(screen.getByTestId("admin-cleanup-postpone-preset-7")).toBeChecked()
    await user.click(confirm())
    await closed()
    expect(postponeCleanupItems).toHaveBeenCalledWith({ batch: BATCH, days: 7 })
  })

  it("closes on a stale batch, calls onStale and gives focus back to its opener", async () => {
    const user = userEvent.setup()
    jest.mocked(postponeCleanupItems).mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    await openDialog(user, { target: { batch: BATCH } })
    await user.click(confirm())
    await closed()
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(mockShowError).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId("open-postpone")).toHaveFocus())
  })

  it("closes on a CONFLICT of a batch with the error toast and onStale (ux-a11y-r8-3)", async () => {
    const user = userEvent.setup()
    const error = "Someone else changed these titles at the same time. Try again."
    jest.mocked(postponeCleanupItems).mockResolvedValueOnce({ success: false, code: "CONFLICT", error })
    await openDialog(user, { target: { batch: BATCH } })
    await user.click(confirm())
    await closed()
    expect(mockShowError).toHaveBeenCalledWith(error)
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it("keeps a stale answer in the dialog when the owner has no onStale", async () => {
    const user = userEvent.setup()
    jest.mocked(postponeCleanupItems).mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    await openDialog(user, { target: { batch: BATCH }, onStale: undefined })
    await user.click(confirm())
    expect(await screen.findByText("The numbers changed. Check them again.")).toBeInTheDocument()
  })
})
