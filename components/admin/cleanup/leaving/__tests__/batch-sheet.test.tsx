/**
 * The phone "Review each" Sheet of a deletion batch (UX 4.7.2 item 3): its
 * `-sheet` ids, the card's selection, its own Show all and pager, and one
 * Postpone, Exclude and approve button per card, with no test id twice.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { batchRow, deletionBatch, leavingData } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { LeavingTab } from "@/components/admin/cleanup/leaving/leaving-tab"
import { pruneBatchSelections } from "@/components/admin/cleanup/leaving/use-batch-selection"
import type { DeletionBatchData } from "@/lib/cleanup/types/list-parts"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/cleanup-items", () => ({ deleteCleanupBatch: jest.fn(), getCleanupBatchSelection: jest.fn(), postponeCleanupItems: jest.fn(),
  excludeCleanupItems: jest.fn(), approveCleanupEntryBatch: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ moveCleanupRuleToDryRun: jest.fn(), setCleanupRuleReviewFirst: jest.fn(), deleteCleanupRule: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({ WhySheet: () => null }))

const BASE = "admin-cleanup-batch-deletion-rule-1"
const SHEET = `${BASE}-sheet`
const rows = Array.from({ length: 50 }, (_, i) => batchRow(i + 1))
const renderTab = (batch: DeletionBatchData) => render(<LeavingTab data={leavingData({ batches: [batch], rows: [], groups: [] })} />)

beforeEach(() => {
  window.sessionStorage.clear()
  pruneBatchSelections([])
  resetUrl("/admin/cleanup?tab=leaving-soon")
})

describe("BatchSheet", () => {
  it("opens from Review each with the -sheet ids and the card's selection", async () => {
    const user = userEvent.setup()
    renderTab(deletionBatch(rows.slice(0, 3)))
    await user.click(screen.getByTestId(`${BASE}-row-movie:tmdb:2-select`))
    await user.click(screen.getByTestId(`${BASE}-review-each`))
    const sheet = await screen.findByTestId(SHEET)
    expect(within(sheet).getByRole("heading", { name: "Review the batch of Movies nobody watches" })).toBeInTheDocument()
    expect(sheet).toHaveTextContent("2 selected, 196 GB. Untick a title to leave it out of this approval.")
    expect(within(sheet).getByTestId(`${SHEET}-table`).tagName).toBe("TABLE")
    expect(within(sheet).getByTestId(`${SHEET}-select-all`)).toBeInTheDocument()
    expect(within(sheet).getByTestId(`${SHEET}-row-movie:tmdb:1-why`)).toBeInTheDocument()
    expect(within(sheet).getByTestId(`${SHEET}-row-movie:tmdb:2-select`)).toHaveAttribute("aria-checked", "false")

    await user.click(within(sheet).getByTestId(`${SHEET}-row-movie:tmdb:3-select`))
    expect(screen.getByTestId(`${BASE}-row-movie:tmdb:3-select`)).toHaveAttribute("aria-checked", "false")
    expect(screen.getByTestId(`${BASE}-footer`)).toHaveTextContent(/^1 selected/)
  })

  it("keeps one Postpone, Exclude and approve button per card, and no test id twice", async () => {
    const user = userEvent.setup()
    renderTab(deletionBatch(rows.slice(0, 3)))
    await user.click(screen.getByTestId(`${BASE}-review-each`))
    await screen.findByTestId(SHEET)
    for (const id of ["postpone", "exclude", "approve"]) expect(screen.getAllByTestId(`${BASE}-${id}`)).toHaveLength(1)
    const ids = Array.from(document.querySelectorAll("[data-testid]"), (element) => element.getAttribute("data-testid"))
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })

  it("pages the rows inside the Sheet with its own ids", async () => {
    const user = userEvent.setup()
    renderTab(deletionBatch(rows, { count: 75, rowsPageCount: 2 }))
    await user.click(screen.getByTestId(`${BASE}-review-each`))
    const sheet = await screen.findByTestId(SHEET)
    expect(within(within(sheet).getByTestId(`${SHEET}-table`)).getAllByRole("row")).toHaveLength(11)
    await user.click(within(sheet).getByTestId(`${SHEET}-show-all`))
    expect(within(within(sheet).getByTestId(`${SHEET}-table`)).getAllByRole("row")).toHaveLength(51)
    expect(within(sheet).getByTestId(`${SHEET}-page-prev`)).toBeDisabled()
    await user.click(within(sheet).getByTestId(`${SHEET}-page-next`))
    expect(currentHref()).toBe("/admin/cleanup?tab=leaving-soon&batch=deletion-rule-1&batchPage=2")
  })
})
