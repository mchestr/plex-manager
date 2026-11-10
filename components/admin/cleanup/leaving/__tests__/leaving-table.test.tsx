/**
 * Everything in Leaving soon (UX 4.7.2, TS 12.6 `leaving/` item 3): groups
 * with `rowgroup` headers and group checkboxes, Show all, the bulk bar as a
 * named region, bulk and row Postpone and Exclude with every toast form,
 * focus after each, the statuses with their subs, the rules cell, the
 * totals row, the filters, the "Shown above" line and the empty states.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { RefObject } from "react"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { excludeCleanupItems, postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { GB, leavingData, leavingRow } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { LeavingTab } from "@/components/admin/cleanup/leaving/leaving-tab"
import type { WhyActionResult } from "@/components/admin/cleanup/why/why-sheet"
import type { LeavingRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupLeavingData } from "@/lib/cleanup/types/screens"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/cleanup-items", () => ({ deleteCleanupBatch: jest.fn(), getCleanupBatchSelection: jest.fn(), postponeCleanupItems: jest.fn(),
  excludeCleanupItems: jest.fn(), approveCleanupEntryBatch: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ moveCleanupRuleToDryRun: jest.fn(), setCleanupRuleReviewFirst: jest.fn(), deleteCleanupRule: jest.fn() }))
const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({
  WhySheet: (props: { itemKey: string | null; ruleId?: string; onActionDone?: (r: WhyActionResult) => void; onClose: () => void;
    finalFocus?: RefObject<HTMLElement | null> }) =>
    props.itemKey ? (
      <button type="button" data-testid="why-stub" data-rule={props.ruleId} onClick={() => {
        props.onActionDone?.({ excluded: 1, rescued: 1, skipped: 0 })
        props.onClose()
        props.finalFocus?.current?.focus()
      }}>
        Exclude {props.itemKey}
      </button>
    ) : null,
}))

const BASE = "admin-cleanup-leaving"
const ROWS = [leavingRow(1), leavingRow(2)]
const renderTab = (data: CleanupLeavingData = leavingData()) => render(<LeavingTab data={data} />)
const select = (row: LeavingRow) => screen.getByTestId(`${BASE}-row-${row.itemKey}-select`)
const listHeading = () => screen.getByRole("heading", { name: "Everything in Leaving soon" })

async function bulk(user: ReturnType<typeof userEvent.setup>, kind: "postpone" | "exclude", rows: LeavingRow[] = ROWS) {
  for (const row of rows) await user.click(select(row))
  await user.click(screen.getByTestId(`${BASE}-bulk-${kind}`))
  await user.click(await screen.findByTestId(`admin-cleanup-${kind}-confirm`))
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/cleanup?tab=leaving-soon")
  jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 2, skipped: 0, firstLeaveOn: "2026-11-26", lastLeaveOn: "2026-11-26" } })
  jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 2, rescued: 2, skipped: 0 } })
})

describe("LeavingTable groups and selection", () => {
  it("groups by leave date under rowgroup headers with a group checkbox, 4 rows and Show all", async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 5 }, (_, i) => leavingRow(i + 1))
    renderTab(leavingData({ rows, groups: [{ date: "2026-11-19", count: 5, bytes: String(160 * GB), inBatch: false, level: "season" }] }))
    const group = screen.getByTestId(`${BASE}-group-2026-11-19`)
    const header = within(group).getByRole("rowheader")
    expect(header).toHaveAttribute("scope", "rowgroup")
    expect(header).toHaveTextContent("Nov 19: 5 seasons, 160 GB")
    expect(screen.getAllByTestId(/^admin-cleanup-leaving-row-.*-select$/)).toHaveLength(4)
    await user.click(screen.getByTestId(`${BASE}-group-2026-11-19-show-all`))
    expect(screen.getAllByTestId(/^admin-cleanup-leaving-row-.*-select$/)).toHaveLength(5)
    await user.click(screen.getByTestId(`${BASE}-group-2026-11-19-select`))
    const region = screen.getByRole("region", { name: "Selection" })
    expect(within(region).getByTestId(`${BASE}-bulk-count`)).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveTextContent("5 selected up to 185 GB")
    await user.click(screen.getByTestId(`${BASE}-bulk-clear`))
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument()
  })

  it("names the due group as shown above, as a line when the batch holds every due title", () => {
    renderTab(leavingData({ groups: [
      { date: "due", count: 6, bytes: String(1240 * GB), inBatch: true, level: "show" },
      { date: "2026-11-19", count: 2, bytes: String(60 * GB), inBatch: false, level: "season" },
    ] }))
    expect(screen.getByTestId(`${BASE}-above`)).toHaveTextContent(/^Today, Nov \d+: 6 shows, 1\.21 TB\. Shown above\.$/)
  })

  it("reads the filtered count with its size, the totals row, the rules cell and the statuses", () => {
    const rows = [
      leavingRow(1, { status: "deletesOn", statusValues: { day: "2026-11-19" }, rules: [{ id: "r1", name: "Old seasons nobody plays" }, { id: "r2", name: "Big shows" }] }),
      leavingRow(2, { status: "waitsForBudget", statusValues: { day: "2026-11-20" }, showAlsoLeaving: true }),
      leavingRow(3, { status: "postponed", statusValues: { day: "2026-12-02", note: "you" } }),
      leavingRow(4, { status: "onHold", statusValues: { note: "Sonarr did not answer at 3:07 AM" } }),
    ]
    renderTab(leavingData({ rows, totals: { count: 52, bytes: String(4608 * GB), volumePercent: 5.4 } }))
    expect(screen.getByTestId(`${BASE}-filters-count`)).toHaveTextContent("52 titles, 4.5 TB")
    expect(screen.getByTestId(`${BASE}-totals`)).toHaveTextContent("52 titles4.5 TB5.4 % of the volume. Each group shows its first rows.")
    const row = (n: number) => screen.getByTestId(`${BASE}-row-${rows[n].itemKey}`)
    expect(row(0)).toHaveTextContent("Deletes on Nov 19")
    expect(row(0)).toHaveTextContent("Also: Big shows")
    expect(row(1)).toHaveTextContent("Waits for budgetThen Nov 20")
    expect(row(1)).toHaveTextContent("The whole show is also leaving, after this season")
    expect(row(2)).toHaveTextContent("PostponedTo Dec 2 by you")
    expect(row(3)).toHaveTextContent("On holdSonarr did not answer at 3:07 AM")
    expect(row(0)).toHaveTextContent("Invented Show 1Season 4TV Shows")
  })

  it("reads Paused for every status while cleanup is paused", () => {
    renderTab(leavingData({ rows: [leavingRow(1, { status: "paused" })], feature: { enabled: true, enabledAt: null, pausedAt: "2026-11-08T09:12:00.000Z",
      pausedBy: null, redis: true } }))
    expect(screen.getByTestId(`${BASE}-row-${leavingRow(1).itemKey}`)).toHaveTextContent("Paused")
  })
})

describe("LeavingTable bulk actions", () => {
  it("postpones the selected rows, counts them in the toast, and focus goes to the list heading", async () => {
    const user = userEvent.setup()
    renderTab()
    await bulk(user, "postpone")
    expect(postponeCleanupItems).toHaveBeenCalledWith({ itemKeys: ROWS.map((row) => row.itemKey), days: 7 })
    expect(mockShowSuccess).toHaveBeenCalledWith("2 titles postponed.")
    await waitFor(() => expect(listHeading()).toHaveFocus())
    expect(screen.queryByRole("region", { name: "Selection" })).not.toBeInTheDocument()
  })

  it("names one title in the bulk toasts, and focus goes to the list heading after a bulk Exclude", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 1, skipped: 0 } })
    jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 1, skipped: 0, firstLeaveOn: null, lastLeaveOn: null } })
    renderTab()
    await bulk(user, "exclude", [ROWS[0]])
    expect(excludeCleanupItems).toHaveBeenCalledWith(expect.objectContaining({ itemKeys: [ROWS[0].itemKey] }))
    expect(mockShowSuccess).toHaveBeenCalledWith("1 title excluded.")
    await waitFor(() => expect(listHeading()).toHaveFocus())
    await bulk(user, "postpone", [ROWS[1]])
    expect(mockShowSuccess).toHaveBeenCalledWith("1 title postponed.")
  })

  it.each([
    [1, "2 titles excluded. 1 is being deleted and was skipped."],
    [2, "2 titles excluded. 2 are being deleted and were skipped."],
  ])("names %i skipped title in the exclude toast", async (skipped, words) => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 2, rescued: 2, skipped } })
    renderTab()
    await bulk(user, "exclude")
    expect(mockShowSuccess).toHaveBeenCalledWith(words)
  })

  it("shows the error toast when every title is being deleted", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 0, rescued: 0, skipped: 2 } })
    jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 0, skipped: 2, firstLeaveOn: null, lastLeaveOn: null } })
    renderTab()
    await bulk(user, "exclude")
    expect(mockShowError).toHaveBeenCalledWith("These titles are being deleted. Nothing was excluded.")
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-exclude-dialog")).not.toBeInTheDocument())
    await bulk(user, "postpone")
    expect(mockShowError).toHaveBeenCalledWith("These titles are being deleted. Nothing was postponed.")
  })

  it.each([
    [1, "1 title postponed. 1 is being deleted and was skipped."],
    [2, "1 title postponed. 2 are being deleted and were skipped."],
  ])("names %i skipped title in the postpone toast", async (skipped, words) => {
    const user = userEvent.setup()
    jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 1, skipped, firstLeaveOn: null, lastLeaveOn: null } })
    renderTab()
    await bulk(user, "postpone")
    expect(mockShowSuccess).toHaveBeenCalledWith(words)
  })
})

describe("LeavingTable row actions", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>, row: LeavingRow, action: string) => {
    await user.click(screen.getByTestId(`${BASE}-actions-${row.itemKey}`))
    await user.click(await screen.findByTestId(`${BASE}-actions-${row.itemKey}-${action}`))
  }

  it("excludes one row by its name, and Postpone names one title", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 1, skipped: 0 } })
    renderTab()
    await open(user, ROWS[0], "exclude")
    expect(await screen.findByTestId("admin-cleanup-exclude-dialog")).toHaveTextContent("Exclude Invented Show 1, Season 4 from cleanup?")
    await user.click(screen.getByTestId("admin-cleanup-exclude-confirm"))
    expect(mockShowSuccess).toHaveBeenCalledWith("Season excluded.")
    await waitFor(() => expect(screen.getByTestId(`${BASE}-actions-${ROWS[0].itemKey}`)).toHaveFocus())
    await open(user, ROWS[1], "postpone")
    expect(await screen.findByTestId("admin-cleanup-postpone-dialog")).toHaveTextContent("Postpone 1 title?")
    expect(screen.getByTestId("admin-cleanup-postpone-dialog")).toHaveTextContent("The whole show moves with it.")
  })

  it("opens the Why Sheet of a row, and focus goes to the list heading once the row is gone", async () => {
    const user = userEvent.setup()
    const { rerender } = renderTab()
    await open(user, ROWS[0], "why")
    expect(screen.getByTestId("why-stub")).toHaveAttribute("data-rule", "rule-2")
    await user.click(screen.getByTestId("why-stub"))
    expect(screen.getByTestId(`${BASE}-actions-${ROWS[0].itemKey}`)).toHaveFocus()
    rerender(<LeavingTab data={leavingData({ rows: [ROWS[1]] })} />)
    expect(listHeading()).toHaveFocus()
  })

  it("links a row to Plex when the server is known", async () => {
    const user = userEvent.setup()
    renderTab(leavingData({ rows: [leavingRow(1, { plexUrl: "https://app.plex.tv/desktop#!/server/m/details?key=1" })] }))
    await user.click(screen.getByTestId(`${BASE}-actions-${ROWS[0].itemKey}`))
    expect(await screen.findByTestId(`${BASE}-actions-${ROWS[0].itemKey}-open-plex`)).toHaveTextContent("Open in Plex")
  })
})

describe("LeavingTable empty states", () => {
  it("says nothing is leaving soon, with a link to the rules", () => {
    renderTab(leavingData({ rows: [], groups: [], totals: { count: 0, bytes: "0", volumePercent: null } }))
    expect(screen.getByTestId(`${BASE}-empty`)).toHaveTextContent("Nothing is leaving soon")
    expect(screen.getByTestId(`${BASE}-empty-rules`)).toHaveAttribute("href", "/admin/cleanup")
  })

  it("says no title matches the filters, and Clear filters clears them", async () => {
    const user = userEvent.setup()
    resetUrl("/admin/cleanup?tab=leaving-soon&q=zzz&status=onHold")
    renderTab(leavingData({ rows: [], groups: [], totals: { count: 0, bytes: "0", volumePercent: null } }))
    expect(screen.getByTestId(`${BASE}-empty`)).toHaveTextContent("No titles match these filters")
    await user.click(screen.getByTestId(`${BASE}-clear-filters`))
    expect(currentHref()).toBe("/admin/cleanup?tab=leaving-soon")
  })

  it("shows the due group line in place of rows when the batch holds every title", () => {
    renderTab(leavingData({ rows: [], groups: [{ date: "due", count: 3, bytes: String(90 * GB), inBatch: true, level: null }],
      totals: { count: 3, bytes: String(90 * GB), volumePercent: null } }))
    expect(screen.getByTestId(`${BASE}-above`)).toHaveTextContent("3 titles, 90 GB. Shown above.")
    expect(screen.queryByTestId(`${BASE}-empty`)).not.toBeInTheDocument()
    act(() => listHeading().focus())
  })
})
