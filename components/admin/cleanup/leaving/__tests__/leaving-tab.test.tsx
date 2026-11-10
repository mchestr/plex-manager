/**
 * The Leaving soon tab (UX 4.7, `shots/07`): batch cards first in the
 * loader's order, then the list heading, the exits line and the list; the
 * paused state; the prune of stored selections; and focus on the list
 * heading after an approval removes the card (UX 7.9).
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { deleteCleanupBatch } from "@/actions/admin/cleanup-items"
import { batchRow, deletionBatch, entryBatch, leavingData } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { LeavingTab } from "@/components/admin/cleanup/leaving/leaving-tab"
import { readBatchSelection, writeBatchSelection } from "@/components/admin/cleanup/leaving/use-batch-selection"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/cleanup-items", () => ({ deleteCleanupBatch: jest.fn(), getCleanupBatchSelection: jest.fn(), postponeCleanupItems: jest.fn(),
  excludeCleanupItems: jest.fn(), approveCleanupEntryBatch: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ moveCleanupRuleToDryRun: jest.fn(), setCleanupRuleReviewFirst: jest.fn(), deleteCleanupRule: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({ WhySheet: () => null }))

const deletion = deletionBatch([batchRow(1), batchRow(2)])
const older = deletionBatch([batchRow(3)], { id: "deletion-rule-3", ruleId: "rule-3", ruleName: "Invented rule three", dueAt: "2026-11-06", dueSince: "2026-11-06" })

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  resetUrl("/admin/cleanup?tab=leaving-soon")
  jest.mocked(deleteCleanupBatch).mockResolvedValue({ success: true, data: { approved: 2, actQueued: false } })
})

describe("LeavingTab", () => {
  it("shows the batch cards first, then the heading, the exits line and the list", () => {
    render(<LeavingTab data={leavingData({ batches: [deletion, older, entryBatch()], exits7d: { kept: 1, played: 0, other: 0 } })} />)
    const tab = screen.getByTestId("admin-cleanup-leaving-tab")
    const order = Array.from(tab.querySelectorAll("[data-testid]"), (el) => el.getAttribute("data-testid"))
      .filter((id) => /^admin-cleanup-(batch-(deletion|entry)-rule-\d|leaving-exits|leaving)$/.test(id ?? ""))
    expect(order).toEqual(["admin-cleanup-batch-deletion-rule-1", "admin-cleanup-batch-deletion-rule-3", "admin-cleanup-batch-entry-rule-2",
      "admin-cleanup-leaving-exits", "admin-cleanup-leaving"])
    const heading = screen.getByRole("heading", { level: 2, name: "Everything in Leaving soon" })
    expect(heading).toHaveAttribute("tabindex", "-1")
    expect(tab).toHaveTextContent("Grouped by leave date. A play, a Keep or a new protection takes a title out at the next check.")
    expect(screen.getByTestId("admin-cleanup-leaving-exits")).toHaveTextContent("1 kept by a member")
  })

  it("holds the approve buttons with the reason while cleanup is off or paused", () => {
    render(<LeavingTab data={leavingData({ batches: [deletion, entryBatch()], feature: { enabled: false, enabledAt: null, pausedAt: null, pausedBy: null,
      redis: true } })} />)
    for (const id of ["admin-cleanup-batch-deletion-rule-1-approve", "admin-cleanup-batch-entry-rule-2-put"]) {
      const button = screen.getByTestId(id)
      expect(button).toHaveAttribute("aria-disabled", "true")
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Cleanup is paused. Resume it first.")
    }
  })

  it("removes the stored selections of deletion batches that the loader no longer lists", async () => {
    writeBatchSelection("deletion-gone", { count: 1, keysHash: "c".repeat(64), afterOwnAction: null,
      unticked: [{ itemKey: "movie:tmdb:9", action: "movie.delete", importListExclusion: false, sizeBytes: "1", inBatch: true }] })
    render(<LeavingTab data={leavingData({ batches: [deletion] })} />)
    await waitFor(() => expect(readBatchSelection("deletion-gone").value).toBeNull())
  })

  it("moves focus to the card heading after an approval, then to the list heading once the card is gone", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LeavingTab data={leavingData({ batches: [deletion] })} />)
    await user.click(screen.getByTestId("admin-cleanup-batch-deletion-rule-1-approve"))
    await user.click(await screen.findByTestId("admin-cleanup-approve-confirm"))
    const card = screen.getByTestId("admin-cleanup-batch-deletion-rule-1")
    await waitFor(() => expect(within(card).getByRole("heading", { name: "2 movies wait for your approval" })).toHaveFocus())
    rerender(<LeavingTab data={leavingData({ batches: [] })} />)
    expect(screen.getByRole("heading", { name: "Everything in Leaving soon" })).toHaveFocus()
  })
})
