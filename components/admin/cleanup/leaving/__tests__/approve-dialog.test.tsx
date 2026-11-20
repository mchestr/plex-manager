/**
 * The approve dialog of a deletion batch (UX 4.7.1 item 2, 8.6, E35, E36):
 * the words of the three action forms with the exclusion on, partly on and
 * off, the selected titles cut at 10, typed approval above 50, the
 * `selected` values it sends for mixed items with unticked rows, the
 * pending label, errors in the open dialog, the stale close and the focus
 * after each close.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"

import { deleteCleanupBatch } from "@/actions/admin/cleanup-items"
import { ApproveDialog, type ApproveDialogProps } from "@/components/admin/cleanup/leaving/approve-dialog"
import type { UntickedRow } from "@/components/admin/cleanup/leaving/selected-summary"
import { Button } from "@/components/ui/button"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"
import type { ActionId } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/actions/admin/cleanup-items", () => ({ deleteCleanupBatch: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const GB = 1024 ** 3
const NOW = Date.parse("2026-11-08T12:00:00Z")
const BUDGET = { items: 20, bytes: String(500 * GB) }

const batchRow = (n: number, overrides: Partial<BatchRow> = {}): BatchRow => ({
  itemKey: `movie:tmdb:${n}`, level: "movie", title: `Invented Movie ${n}`, year: 2020, seasonNumber: null, episodeCount: null, seasonCount: null,
  posterKey: null, sectionId: "1", sizeBytes: String((100 - n) * GB), action: "movie.delete", importListExclusion: false, lastPlayedAt: "never", ...overrides,
})

function batchOf(rows: BatchRow[], overrides: Partial<DeletionBatchData> = {}): DeletionBatchData {
  const actionCounts: Partial<Record<ActionId, number>> = {}
  for (const r of rows) actionCounts[r.action] = (actionCounts[r.action] ?? 0) + 1
  return {
    kind: "deletion", id: "deletion-rule-1", ruleId: "rule-1", ruleName: "Movies nobody watches", level: rows[0]?.level ?? "movie",
    action: rows.some((r) => r.action.endsWith(".delete")) ? (rows.find((r) => r.action.endsWith(".delete"))?.action as ActionId) : (rows[0]?.action as ActionId),
    importListExclusion: rows.some((r) => r.importListExclusion), actionCounts, exclusionCount: rows.filter((r) => r.importListExclusion).length,
    keysHash: "a".repeat(64), reviewedAt: "2026-11-08T11:58:00.000Z", dueAt: "2026-11-08", dueSince: "2026-11-08", checkedAt: null,
    plan: { today: { count: 2, bytes: "0" }, lastDay: "2026-11-10" }, oversize: [], rows, rowsPage: 1, rowsPageCount: 1,
    count: rows.length, bytes: String(rows.reduce((sum, r) => sum + Number(r.sizeBytes), 0)), ...overrides,
  }
}

const unticked = (r: BatchRow, inBatch = true): UntickedRow => ({ itemKey: r.itemKey, action: r.action, importListExclusion: r.importListExclusion,
  sizeBytes: r.sizeBytes ?? "0", inBatch })

const onStale = jest.fn()
const onApproved = jest.fn()

function Harness(props: Partial<ApproveDialogProps> & { batch: DeletionBatchData }) {
  const [open, setOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        Batch card
      </h2>
      <Button onClick={() => setOpen(true)} data-testid="open-approve">
        Approve and delete
      </Button>
      <ApproveDialog unticked={[]} budget={BUDGET} open={open} onOpenChange={setOpen} onStale={onStale} onApproved={onApproved} successFocus={heading} {...props} />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, props: Partial<ApproveDialogProps> & { batch: DeletionBatchData }) {
  render(<Harness {...props} />)
  await user.click(screen.getByTestId("open-approve"))
  return screen.findByTestId("admin-cleanup-approve-dialog")
}

const confirm = () => screen.getByTestId("admin-cleanup-approve-confirm")

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(deleteCleanupBatch).mockResolvedValue({ success: true, data: { approved: 3, actQueued: true } })
})

afterEach(() => jest.restoreAllMocks())

describe("ApproveDialog words", () => {
  it("names a delete action with its budget days, the check sentence and the title list", async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user, { batch: batchOf([batchRow(1), batchRow(2), batchRow(3)]) })
    expect(within(dialog).getByRole("heading", { name: "Delete 3 movies and their files in Radarr?" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent(
      "Up to 294 GB. Radarr deletes them inside the daily budget of 20 items and 500 GB, from Nov 8 to Nov 10, largest first. Before each delete, the app checks again for plays, Keeps, new requests and rule changes. You cannot undo a delete.")
    expect(dialog).not.toHaveTextContent("import list exclusion")
    expect(confirm()).toHaveTextContent("Delete 3 movies")
    const titles = within(screen.getByTestId("admin-cleanup-approve-titles")).getAllByRole("listitem")
    expect(titles.map((li) => li.textContent)).toEqual(["Invented Movie 199 GB", "Invented Movie 298 GB", "Invented Movie 397 GB"])
    expect(screen.queryByTestId("admin-cleanup-approve-dialog-confirm-text")).not.toBeInTheDocument()
  })

  it("names the exclusion for every selected title, or for some of them with unticked rows subtracted (safety-r3-2)", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1, { importListExclusion: true }), batchRow(2, { importListExclusion: true }), batchRow(3)]
    const dialog = await openDialog(user, { batch: batchOf(rows), unticked: [unticked(rows[2])] })
    expect(dialog).toHaveTextContent("Each movie also gets an import list exclusion.")
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-approve-dialog")).not.toBeInTheDocument())

    await user.click(screen.getByTestId("open-approve"))
    expect(await screen.findByTestId("admin-cleanup-approve-dialog")).toHaveTextContent("Each movie also gets")
  })

  it("says how many of the selected titles get the exclusion when only some do", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1, { importListExclusion: true }), batchRow(2, { importListExclusion: true }), batchRow(3), batchRow(4)]
    const dialog = await openDialog(user, { batch: batchOf(rows), unticked: [unticked(rows[0])] })
    expect(dialog).toHaveTextContent("1 of them also gets an import list exclusion.")
    expect(dialog).not.toHaveTextContent("Each movie also gets")
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Delete 3 movies and their files in Radarr?")
  })

  it("never says 'and their files' for an unmonitor batch, and names no exclusion", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1, { action: "movie.unmonitorDeleteFiles" }), batchRow(2, { action: "movie.unmonitorDeleteFiles" })]
    const dialog = await openDialog(user, { batch: batchOf(rows) })
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Delete the files of 2 movies in Radarr?")
    expect(dialog).toHaveTextContent("Up to 197 GB. Radarr keeps each movie and stops monitoring it, so it does not download it again. It deletes the files inside the daily budget, from Nov 8 to Nov 10, largest first.")
    expect(dialog).not.toHaveTextContent("and their files")
    expect(confirm()).toHaveTextContent("Delete the files of 2 movies")
  })

  it("names seasons with their show and number, and the oversize line", async () => {
    const user = userEvent.setup()
    const rows = [1, 2, 3].map((n) => batchRow(n, { itemKey: `season:tvdb:9:${n}`, level: "season", title: "Invented Show", seasonNumber: n, action: "season.unmonitorDeleteFiles" }))
    const batch = batchOf(rows, { oversize: [{ title: "Invented Show, Season 1", day: "2026-11-09" }], plan: { today: { count: 0, bytes: "0" }, lastDay: null } })
    const dialog = await openDialog(user, { batch })
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Delete the files of 3 seasons in Sonarr?")
    expect(dialog).toHaveTextContent("Sonarr keeps each show and stops monitoring these seasons. It deletes the files inside the daily budget, from Nov 9 to Nov 9, largest first.")
    expect(dialog).toHaveTextContent("1 season is larger than the daily space budget. Each goes alone on its own day: Invented Show, Season 1 on Nov 9.")
    expect(within(screen.getByTestId("admin-cleanup-approve-titles")).getAllByRole("listitem")[0]).toHaveTextContent("Invented Show, Season 199 GB")
  })

  it("follows the least careful action of mixed items (E35)", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1, { action: "movie.unmonitorDeleteFiles" }), batchRow(2), batchRow(3, { action: "movie.unmonitorDeleteFiles" })]
    const dialog = await openDialog(user, { batch: batchOf(rows) })
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Delete 3 movies and their files in Radarr?")
  })

  it("lists the 10 largest selected titles, then 'and {N} more', leaving the unticked rows out", async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 14 }, (_, i) => batchRow(i + 1))
    const shuffled = [...rows].reverse()
    await openDialog(user, { batch: batchOf(rows), rows: shuffled, unticked: [unticked(rows[0]), unticked(batchRow(90), false)] })
    const list = screen.getByTestId("admin-cleanup-approve-titles")
    const titles = within(list).getAllByRole("listitem").map((li) => li.textContent)
    expect(titles).toHaveLength(10)
    expect(titles[0]).toBe("Invented Movie 298 GB")
    expect(titles[9]).toBe("Invented Movie 1189 GB")
    expect(list).toHaveTextContent("and 3 more")
  })
})

describe("ApproveDialog approval", () => {
  it("sends the batch, the unticked keys and the selected values for mixed items, then toasts and moves focus to the card heading", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1, { importListExclusion: true }), batchRow(2, { action: "movie.unmonitorDeleteFiles" }), batchRow(3, { importListExclusion: true }), batchRow(4)]
    const gone = unticked(batchRow(80), false)
    await openDialog(user, { batch: batchOf(rows), unticked: [unticked(rows[0]), gone] })
    await user.click(confirm())
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-approve-dialog")).not.toBeInTheDocument())
    expect(deleteCleanupBatch).toHaveBeenCalledWith({
      batchId: "deletion-rule-1", count: 4, keysHash: "a".repeat(64), excludeKeys: ["movie:tmdb:1", "movie:tmdb:80"],
      selected: { count: 3, action: "movie.delete", exclusionCount: 1 }, reviewedAt: "2026-11-08T11:58:00.000Z",
    })
    expect(mockShowSuccess).toHaveBeenCalledWith("Batch approved. Deletions start now.")
    expect(onApproved).toHaveBeenCalledWith({ approved: 3, actQueued: true })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Batch card" })).toHaveFocus())
  })

  it("says the deletions start at the nightly run when the act step was not queued", async () => {
    const user = userEvent.setup()
    jest.mocked(deleteCleanupBatch).mockResolvedValueOnce({ success: true, data: { approved: 1, actQueued: false } })
    await openDialog(user, { batch: batchOf([batchRow(1)]) })
    await user.click(confirm())
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Batch approved. The deletions start at the next nightly run."))
  })

  it("needs the typed count above 50 and sends it", async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 52 }, (_, i) => batchRow(i + 1))
    await openDialog(user, { batch: batchOf(rows) })
    expect(confirm()).toBeDisabled()
    await user.type(screen.getByTestId("admin-cleanup-approve-dialog-confirm-text"), "52")
    expect(confirm()).toBeEnabled()
    await user.click(confirm())
    await waitFor(() => expect(deleteCleanupBatch).toHaveBeenCalledWith(expect.objectContaining({ typedCount: 52, selected: expect.objectContaining({ count: 52 }) })))
  })

  it("shows the pending label while it runs, and an error in the open dialog", async () => {
    const user = userEvent.setup()
    let settle: (value: Awaited<ReturnType<typeof deleteCleanupBatch>>) => void = () => {}
    jest.mocked(deleteCleanupBatch).mockImplementationOnce(() => new Promise((resolve) => (settle = resolve)))
    await openDialog(user, { batch: batchOf([batchRow(1)]) })
    await user.click(confirm())
    expect(await screen.findByText("Approving")).toBeInTheDocument()
    settle({ success: false, code: "CLEANUP_PAUSED", error: "Cleanup is paused. Resume it first." })
    expect(await screen.findByText("Cleanup is paused. Resume it first.")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-approve-dialog")).toBeInTheDocument()
    expect(onStale).not.toHaveBeenCalled()
  })

  it("closes on CLEANUP_REVIEW_STALE, calls onStale and gives focus back to the button that opened it", async () => {
    const user = userEvent.setup()
    jest.mocked(deleteCleanupBatch).mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    await openDialog(user, { batch: batchOf([batchRow(1)]) })
    await user.click(confirm())
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-approve-dialog")).not.toBeInTheDocument())
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(mockShowSuccess).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId("open-approve")).toHaveFocus())
  })

  it("sends nothing with 0 selected", async () => {
    const user = userEvent.setup()
    const rows = [batchRow(1)]
    await openDialog(user, { batch: batchOf(rows), unticked: [unticked(rows[0])] })
    await user.click(confirm())
    expect(await screen.findByText("Select at least one title")).toBeInTheDocument()
    expect(deleteCleanupBatch).not.toHaveBeenCalled()
  })
})
