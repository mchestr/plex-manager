/**
 * A deletion batch card (UX 4.7.1, TS 12.6 `leaving/` item 2.10): the words,
 * Due since, the plan line, Show all with pages, the batch table ids, and
 * the E36 and E37 rules of its selection through the Leaving soon tab, which
 * gives the card its focus targets. `beforeEach` clears `sessionStorage`.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode, RefObject } from "react"
import { renderToString } from "react-dom/server"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { deleteCleanupBatch, excludeCleanupItems, getCleanupBatchSelection, postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { batchRow, deletionBatch, GB, HASH_A, HASH_B, HASH_C, leavingData, REVIEWED_AT } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { CHANGED_WORDS, LIMIT_WORDS } from "@/components/admin/cleanup/leaving/deletion-batch-card"
import { LeavingTab } from "@/components/admin/cleanup/leaving/leaving-tab"
import { MAX_UNTICKED, pruneBatchSelections, writeBatchSelection } from "@/components/admin/cleanup/leaving/use-batch-selection"
import type { WhyActionResult } from "@/components/admin/cleanup/why/why-sheet"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"

// The URL helper with a server render: the waiting state renders with `renderToString`
jest.mock("next/navigation", () => {
  const helper = require("@/__tests__/helpers/url-router")
  const url = () => new URL(helper.currentHref(), "http://test")
  return { ...helper.navigationModule, useRouter: () => ({ replace: helper.replaceMock, push: helper.replaceMock, refresh: mockRefresh }),
    usePathname: () => url().pathname, useSearchParams: () => url().searchParams }
})
jest.mock("@/actions/admin/cleanup-items", () => ({ deleteCleanupBatch: jest.fn(), getCleanupBatchSelection: jest.fn(), postponeCleanupItems: jest.fn(),
  excludeCleanupItems: jest.fn(), approveCleanupEntryBatch: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ moveCleanupRuleToDryRun: jest.fn(), setCleanupRuleReviewFirst: jest.fn(), deleteCleanupRule: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))
const mockRefresh = jest.fn()
let mockWhyResult: WhyActionResult = { postponed: 1, skipped: 0, firstLeaveOn: "2026-11-15", lastLeaveOn: "2026-11-15" }
// The Why Sheet stub: its one action reports the result, closes, and moves focus as the real Sheet does
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({
  WhySheet: (props: { itemKey: string | null; onActionDone?: (r: WhyActionResult) => void; onClose: () => void; finalFocus?: RefObject<HTMLElement | null> }) =>
    props.itemKey ? (
      <button type="button" data-testid="why-stub-postpone" onClick={() => {
        props.onActionDone?.(mockWhyResult)
        props.onClose()
        props.finalFocus?.current?.focus()
      }}>
        Postpone {props.itemKey}
      </button>
    ) : null,
}))

const BASE = "admin-cleanup-batch-deletion-rule-1"
const rowsOf = (count: number, from = 1) => Array.from({ length: count }, (_, i) => batchRow(from + i))
const ROWS = rowsOf(3)
const LATER = "2026-11-08T12:05:00.000Z"
const tab = (batch: DeletionBatchData | null, paused = false): ReactNode => (
  <LeavingTab data={leavingData({ batches: batch ? [batch] : [], rows: [], groups: [], totals: { count: batch?.count ?? 0, bytes: "0", volumePercent: null },
    feature: { enabled: true, enabledAt: null, pausedAt: paused ? REVIEWED_AT : null, pausedBy: null, redis: true } })} />
)
const box = (key: string, base = BASE) => screen.getByTestId(`${base}-row-${key}-select`)
const footer = () => screen.getByTestId(`${BASE}-footer`)
const selection = (rows: BatchRow[], count: number, hash: string) => ({ success: true as const, data: { count, bytes: String(count * GB), keysHash: hash,
  actionCounts: { "movie.delete": count }, exclusionCount: 0,
  unticked: rows.map((r) => ({ itemKey: r.itemKey, action: r.action, importListExclusion: r.importListExclusion, sizeBytes: r.sizeBytes ?? "0" })) } })

async function approve(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId(`${BASE}-approve`))
  await user.click(await screen.findByTestId("admin-cleanup-approve-confirm"))
}

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  pruneBatchSelections([])
  resetUrl("/admin/cleanup?tab=leaving-soon")
  mockWhyResult = { postponed: 1, skipped: 0, firstLeaveOn: "2026-11-15", lastLeaveOn: "2026-11-15" }
  jest.mocked(deleteCleanupBatch).mockResolvedValue({ success: true, data: { approved: 1, actQueued: true } })
  jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 2, skipped: 0, firstLeaveOn: "2026-11-15", lastLeaveOn: "2026-11-15" } })
  jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 2, rescued: 2, skipped: 0 } })
})

describe("DeletionBatchCard words", () => {
  it("names the batch, Due today, the three facts and the delete action", () => {
    render(tab(deletionBatch(ROWS, { oversize: [{ title: "Invented Movie 1", day: "2026-11-11" }] })))
    const card = screen.getByTestId(BASE)
    expect(within(card).getByRole("heading", { name: "3 movies wait for your approval" })).toBeInTheDocument()
    expect(card).toHaveTextContent("Due today")
    expect(card).toHaveTextContent("Movies nobody watches is in Review first. These movies reached their leave date today. Nothing is deleted until you approve.")
    expect(card).toHaveTextContent("Checked again at 3:07 AM today: no play, no Keep, no new request, no new episode.")
    expect(card).toHaveTextContent("Today: 1 movie, 99 GB. The rest go on Nov 9 to Nov 10.")
    expect(card).toHaveTextContent("Each movie is read again just before it goes. If anything changed, it stays.")
    expect(card).toHaveTextContent("1 movie is larger than the daily space budget. Each goes alone on its own day: Invented Movie 1 on Nov 11.")
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveTextContent("Approve and delete 3 movies...")
    expect(screen.getByTestId(`${BASE}-table`).tagName).toBe("TABLE")
    expect(screen.getByTestId(`${BASE}-select-all`)).toBeInTheDocument()
    expect(screen.getByTestId(`${BASE}-row-movie:tmdb:1-why`)).toHaveAccessibleName("Why: Invented Movie 1")
  })

  it("reads Due since for older items, the files action of seasons and a plan with no title today", () => {
    const seasons = rowsOf(2).map((row, i) => ({ ...row, level: "season" as const, title: "Invented Show", seasonNumber: i + 1, action: "season.unmonitorDeleteFiles" as const }))
    render(tab(deletionBatch(seasons, { dueSince: "2026-11-05", dueAt: "2026-11-07", checkedAt: "2026-11-06T03:07:00.000Z",
      plan: { today: { count: 0, bytes: "0" }, lastDay: "2026-11-09" } })))
    const card = screen.getByTestId(BASE)
    expect(card).toHaveTextContent("Due since Nov 5")
    expect(card).toHaveTextContent("2 seasons reached their leave date between Nov 5 and Nov 7.")
    expect(card).toHaveTextContent("Checked again at 3:07 AM on Nov 6")
    expect(card).toHaveTextContent("Today's budget is used. They go on Nov 9.")
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveTextContent("Approve and delete the files of 2 seasons...")
  })

  it("names one title on one day, with all of it today", () => {
    render(tab(deletionBatch([batchRow(1)], { dueSince: "2026-11-06", dueAt: "2026-11-06", plan: { today: { count: 1, bytes: String(99 * GB) }, lastDay: null } })))
    const card = screen.getByTestId(BASE)
    expect(within(card).getByRole("heading", { name: "1 movie waits for your approval" })).toBeInTheDocument()
    expect(card).toHaveTextContent("1 movie reached its leave date on Nov 6.")
    expect(card).toHaveTextContent("Today: 1 movie, 99 GB.")
    expect(card).not.toHaveTextContent("The rest go")
  })
})

describe("DeletionBatchCard rows", () => {
  it("shows the 10 largest, then Show all with pages of 50 that write batchPage and never page", async () => {
    const user = userEvent.setup()
    const page1 = rowsOf(50)
    const { rerender } = render(tab(deletionBatch(page1, { count: 60, rowsPageCount: 2 })))
    const table = screen.getByTestId(`${BASE}-table`)
    expect(within(table).getAllByRole("row")).toHaveLength(11)
    await user.click(screen.getByTestId(`${BASE}-show-all`))
    expect(within(table).getAllByRole("row")).toHaveLength(51)
    await user.click(screen.getByTestId(`${BASE}-page-next`))
    expect(currentHref()).toBe("/admin/cleanup?tab=leaving-soon&batch=deletion-rule-1&batchPage=2")
    rerender(tab(deletionBatch(rowsOf(10, 51), { count: 60, rowsPage: 2, rowsPageCount: 2 })))
    await user.click(screen.getByTestId(`${BASE}-page-prev`))
    expect(currentHref()).not.toMatch(/[?&]page=/)
    expect(currentHref()).toBe("/admin/cleanup?tab=leaving-soon&batch=deletion-rule-1")
  })

  it("keeps an untick on page 1 while page 2 shows, and sends it with the approval", async () => {
    const user = userEvent.setup()
    const counts = { count: 60, bytes: String(60 * GB), actionCounts: { "movie.delete": 60 }, rowsPageCount: 2 }
    const { rerender } = render(tab(deletionBatch(rowsOf(50), { ...counts })))
    await user.click(box("movie:tmdb:1"))
    expect(box("movie:tmdb:1")).toHaveAttribute("aria-checked", "false")
    rerender(tab(deletionBatch(rowsOf(10, 51), { ...counts, rowsPage: 2 })))
    expect(footer()).toHaveTextContent("59 selected")
    await user.click(screen.getByTestId(`${BASE}-approve`))
    await user.type(await screen.findByRole("textbox"), "59")
    await user.click(screen.getByTestId("admin-cleanup-approve-confirm"))
    expect(deleteCleanupBatch).toHaveBeenCalledWith(expect.objectContaining({ count: 60, excludeKeys: ["movie:tmdb:1"], typedCount: 59,
      selected: { count: 59, action: "movie.delete", exclusionCount: 0 }, reviewedAt: REVIEWED_AT }))
  })

  it("reads 0 selected after a select-all untick, and the three buttons wait, focusable, with the reason", async () => {
    const user = userEvent.setup()
    render(tab(deletionBatch(ROWS)))
    await user.click(screen.getByTestId(`${BASE}-select-all`))
    expect(footer()).toHaveTextContent("0 selected. Select a title to approve, postpone or exclude it.")
    expect(footer()).toHaveTextContent("3 titles not selected. This browser tab keeps your choice.")
    for (const id of ["postpone", "exclude", "approve"]) {
      const button = screen.getByTestId(`${BASE}-${id}`)
      expect(button).toHaveAttribute("aria-disabled", "true")
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Select at least one title")
      act(() => button.focus())
      expect(button).toHaveFocus()
    }
  })

  it("renders every Postpone, Exclude and approve button once, in the phone order", () => {
    render(tab(deletionBatch(ROWS)))
    const ids = ["review-each", "postpone", "exclude", "approve"].map((id) => screen.getAllByTestId(`${BASE}-${id}`))
    ids.forEach((list, index) => expect(list[0]).toHaveClass(`order-${index + 1}`))
    expect(ids.every((list) => list.length === 1)).toBe(true)
    expect(screen.getByTestId(`${BASE}-exclude`)).toHaveTextContent("Exclude...")
    expect(screen.getByTestId(`${BASE}-titles`)).toBeInTheDocument()
  })
})

describe("DeletionBatchCard selection (E36)", () => {
  const [A, B, C] = ROWS

  it("keeps A and B unticked over a batch change where B left, with B in excludeKeys and out of the count", async () => {
    const user = userEvent.setup()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([A], 2, HASH_B))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    await user.click(box(B.itemKey))
    rerender(tab(deletionBatch([A, C], { keysHash: HASH_B, reviewedAt: LATER })))
    expect(await screen.findByTestId(`${BASE}-changed`)).toHaveTextContent(CHANGED_WORDS.changed)
    expect(getCleanupBatchSelection).toHaveBeenCalledWith({ batchId: "deletion-rule-1", keys: [A.itemKey, B.itemKey] })
    await waitFor(() => expect(footer()).toHaveTextContent(/^1 selected/))
    expect(box(A.itemKey)).toHaveAttribute("aria-checked", "false")
    expect(screen.getByTestId(`${BASE}-not-selected`)).toHaveTextContent("1 title not selected")
    await approve(user)
    expect(deleteCleanupBatch).toHaveBeenCalledWith(expect.objectContaining({ count: 2, keysHash: HASH_B, excludeKeys: [A.itemKey, B.itemKey],
      selected: { count: 1, action: "movie.delete", exclusionCount: 0 }, reviewedAt: LATER }))
  })

  it("does the same after a stale approval, and reads again on the newer render with the same numbers", async () => {
    const user = userEvent.setup()
    jest.mocked(deleteCleanupBatch).mockResolvedValueOnce({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([A], 3, HASH_A))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    await approve(user)
    expect(await screen.findByTestId(`${BASE}-changed`)).toHaveTextContent(CHANGED_WORDS.changed)
    expect(mockRefresh).toHaveBeenCalled()
    await waitFor(() => expect(getCleanupBatchSelection).toHaveBeenCalledTimes(1))
    rerender(tab(deletionBatch(ROWS, { reviewedAt: LATER })))
    await waitFor(() => expect(screen.getByTestId(`${BASE}-approve`)).not.toHaveAttribute("aria-disabled"))
    await approve(user)
    expect(deleteCleanupBatch).toHaveBeenLastCalledWith(expect.objectContaining({ excludeKeys: [A.itemKey], reviewedAt: LATER }))
  })

  it("keeps A unticked over an unmount, and waits for the client read in the server render", async () => {
    const user = userEvent.setup()
    const { unmount } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    unmount()
    const html = renderToString(<>{tab(deletionBatch(ROWS))}</>)
    expect(html).toContain("Checking the selection again.")
    render(tab(deletionBatch(ROWS)))
    expect(box(A.itemKey)).toHaveAttribute("aria-checked", "false")
    expect(footer()).toHaveTextContent("2 selected")
    expect(getCleanupBatchSelection).not.toHaveBeenCalled()
  })

  it("reads at a mount with a new keysHash and shows the alert; B that left and came back stays unticked", async () => {
    writeBatchSelection("deletion-rule-1", { count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: [
      { itemKey: B.itemKey, action: "movie.delete", importListExclusion: false, sizeBytes: "1", inBatch: false }] })
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([B], 3, HASH_C))
    render(tab(deletionBatch(ROWS, { keysHash: HASH_C })))
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveAttribute("aria-disabled", "true")
    expect(await screen.findByTestId(`${BASE}-changed`)).toBeInTheDocument()
    await waitFor(() => expect(footer()).toHaveTextContent(/^2 selected/))
    expect(box(B.itemKey)).toHaveAttribute("aria-checked", "false")
  })

  it("shows no alert after a partial approval, and reads 0 selected when only unticked titles remain", async () => {
    const user = userEvent.setup()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([A], 1, HASH_B))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    await approve(user)
    rerender(tab(deletionBatch([A], { keysHash: HASH_B, reviewedAt: LATER })))
    await waitFor(() => expect(footer()).toHaveTextContent("0 selected. Select a title to approve, postpone or exclude it."))
    expect(screen.queryByTestId(`${BASE}-changed`)).not.toBeInTheDocument()
    expect(box(A.itemKey)).toHaveAttribute("aria-checked", "false")
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveAttribute("aria-disabled", "true")
  })

  it("shows the error toast after a failed read, keeps the alert, and a focused approve button keeps focus", async () => {
    const user = userEvent.setup()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue({ success: false, code: "RATE_LIMITED", error: "Too many tries. Wait a minute." })
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    const button = screen.getByTestId(`${BASE}-approve`)
    act(() => button.focus())
    rerender(tab(deletionBatch([A, B], { keysHash: HASH_B, reviewedAt: LATER })))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Too many tries. Wait a minute."))
    expect(screen.getByTestId(`${BASE}-changed`)).toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it("shows the lost words once for a stored value that does not parse", () => {
    window.sessionStorage.setItem("cleanup:batch-selection:deletion-rule-1", "[1,2]")
    render(tab(deletionBatch(ROWS)))
    expect(screen.getByTestId(`${BASE}-changed`)).toHaveTextContent(CHANGED_WORDS.lost)
    expect(box(A.itemKey)).toHaveAttribute("aria-checked", "true")
  })

  it("at the 500 limit, a page select-all leaves every row ticked and shows the error toast", async () => {
    const user = userEvent.setup()
    writeBatchSelection("deletion-rule-1", { count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: Array.from({ length: MAX_UNTICKED }, (_, i) => (
      { itemKey: `movie:tmdb:${900 + i}`, action: "movie.delete" as const, importListExclusion: false, sizeBytes: "1", inBatch: true })) })
    render(tab(deletionBatch(ROWS)))
    await user.click(screen.getByTestId(`${BASE}-select-all`))
    expect(mockShowError).toHaveBeenCalledWith(LIMIT_WORDS)
    expect(ROWS.every((row) => box(row.itemKey).getAttribute("aria-checked") === "true")).toBe(true)
  })
})

describe("DeletionBatchCard footer actions (E37)", () => {
  const [A] = ROWS

  it("sends the batch form from the footer Postpone, and focus goes to the list heading once the card is gone", async () => {
    const user = userEvent.setup()
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(A.itemKey))
    await user.click(screen.getByTestId(`${BASE}-postpone`))
    await user.click(await screen.findByTestId("admin-cleanup-postpone-confirm"))
    expect(postponeCleanupItems).toHaveBeenCalledWith({ batch: { batchId: "deletion-rule-1", count: 3, keysHash: HASH_A, excludeKeys: [A.itemKey], selectedCount: 2 },
      days: 7 })
    await waitFor(() => expect(screen.getByRole("heading", { name: "3 movies wait for your approval" })).toHaveFocus())
    rerender(tab(null))
    expect(screen.getByRole("heading", { name: "Everything in Leaving soon" })).toHaveFocus()
  })

  it("names one skipped title in the footer Exclude and Postpone toasts", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 0, rescued: 0, skipped: 1 } })
    jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 0, skipped: 1, firstLeaveOn: null, lastLeaveOn: null } })
    render(tab(deletionBatch([A])))
    await user.click(screen.getByTestId(`${BASE}-exclude`))
    await user.click(await screen.findByTestId("admin-cleanup-exclude-confirm"))
    expect(mockShowError).toHaveBeenCalledWith("This title is being deleted. Nothing was excluded.")
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-exclude-dialog")).not.toBeInTheDocument())
    await user.click(screen.getByTestId(`${BASE}-postpone`))
    await user.click(await screen.findByTestId("admin-cleanup-postpone-confirm"))
    expect(mockShowError).toHaveBeenCalledWith("This title is being deleted. Nothing was postponed.")
  })
})

describe("DeletionBatchCard and the Why Sheet", () => {
  const [A, B, C] = ROWS

  it("shows no alert after a Why Sheet postpone of a batch row, and focus goes to the card heading once the row is gone", async () => {
    const user = userEvent.setup()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([C], 2, HASH_B))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(C.itemKey))
    await user.click(screen.getByTestId(`${BASE}-row-${B.itemKey}-why`))
    await user.click(screen.getByTestId("why-stub-postpone"))
    expect(screen.getByTestId(`${BASE}-row-${B.itemKey}-why`)).toHaveFocus()
    rerender(tab(deletionBatch([A, C], { keysHash: HASH_B, reviewedAt: LATER })))
    expect(screen.getByRole("heading", { name: "2 movies wait for your approval" })).toHaveFocus()
    await waitFor(() => expect(getCleanupBatchSelection).toHaveBeenCalled())
    expect(screen.queryByTestId(`${BASE}-changed`)).not.toBeInTheDocument()
  })

  it("sets no flag for a postpone that moved nothing, so the change shows the alert", async () => {
    const user = userEvent.setup()
    mockWhyResult = { postponed: 0, skipped: 1, firstLeaveOn: null, lastLeaveOn: null }
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([C], 3, HASH_B))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(C.itemKey))
    await user.click(screen.getByTestId(`${BASE}-row-${B.itemKey}-why`))
    await user.click(screen.getByTestId("why-stub-postpone"))
    rerender(tab(deletionBatch(ROWS, { keysHash: HASH_B, reviewedAt: LATER })))
    expect(await screen.findByTestId(`${BASE}-changed`)).toBeInTheDocument()
  })

  it("after a Why Sheet postpone of the unticked row, every row is ticked, and a later change still shows the alert", async () => {
    const user = userEvent.setup()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([], 2, HASH_B))
    const { rerender } = render(tab(deletionBatch(ROWS)))
    await user.click(box(C.itemKey))
    await user.click(screen.getByTestId(`${BASE}-row-${C.itemKey}-why`))
    await user.click(screen.getByTestId("why-stub-postpone"))
    rerender(tab(deletionBatch([A, B], { keysHash: HASH_B, reviewedAt: LATER })))
    await waitFor(() => expect(footer()).toHaveTextContent(/^2 selected/))
    expect(screen.queryByTestId(`${BASE}-changed`)).not.toBeInTheDocument()
    jest.mocked(getCleanupBatchSelection).mockResolvedValue(selection([], 1, HASH_C))
    rerender(tab(deletionBatch([A], { keysHash: HASH_C, reviewedAt: "2026-11-08T12:09:00.000Z" })))
    expect(await screen.findByTestId(`${BASE}-changed`)).toHaveTextContent(CHANGED_WORDS.changed)
  })
})

describe("DeletionBatchCard while paused", () => {
  it("holds only the approve button, with the pause reason", () => {
    render(tab(deletionBatch(ROWS), true))
    const approveButton = screen.getByTestId(`${BASE}-approve`)
    expect(document.getElementById(approveButton.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Cleanup is paused. Resume it first.")
    expect(screen.getByTestId(`${BASE}-postpone`)).not.toHaveAttribute("aria-disabled")
  })
})
