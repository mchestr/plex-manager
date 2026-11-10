/**
 * The History tab (UX 4.9, `shots/09`): the Runs table with outcomes, error
 * codes, who started each run and the audit link; the Deleted titles table
 * with its cells, a failed and a still-unmonitored row of one title, the
 * read-only Why, the filters and the empty states.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { RefObject } from "react"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { historyData, historyRun, historyTitle } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { HistoryTab } from "@/components/admin/cleanup/history/history-tab"
import { approvedWords } from "@/components/admin/cleanup/history/deleted-table"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/components/admin/cleanup/why/why-sheet", () => ({
  WhySheet: (props: { itemKey: string | null; outcomeId?: string; surface: string; onClose: () => void;
    finalFocus?: ((closeType: string) => HTMLElement | boolean | null) | RefObject<HTMLElement | null> }) =>
    props.itemKey ? (
      <button type="button" data-testid="why-stub" data-outcome={props.outcomeId} data-surface={props.surface} onClick={() => {
        props.onClose()
        const target = typeof props.finalFocus === "function" ? props.finalFocus("click") : null
        if (target instanceof HTMLElement) target.focus()
      }}>
        Close
      </button>
    ) : null,
}))

const cells = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.replace(cell.querySelector('[data-slot="cell-label"]')?.textContent ?? "", ""))

beforeEach(() => resetUrl("/admin/cleanup?tab=history"))

describe("HistoryTab runs", () => {
  it("lists the runs with their counts, outcome, error code and audit link", () => {
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-08T12:00:00.000Z"))
    render(<HistoryTab data={historyData({ runs: [
      historyRun({ outcomeValues: { waiting: 6, level: "show" } }),
      historyRun({ id: "run-2", startedAt: "2026-11-06T03:07:00.000Z", outcome: "blocked", checked: 0, joined: 0, rescued: 0,
        blocks: [{ code: "sourceFailed", service: "tautulli" }], errorCode: "TIMEOUT" }),
      historyRun({ id: "run-3", finishedAt: null, outcome: null, trigger: "admin", actor: { id: "u1", name: "Invented Admin", isYou: true },
        deleted: 4, freedBytes: String(96 * 1024 ** 3) }),
    ] })} />)
    expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument()
    expect(screen.getByText("The newest 30 runs. Each run links to its rows in the audit log.")).toBeInTheDocument()
    expect(within(screen.getByTestId("admin-cleanup-runs")).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Started", "Started by", "Rules", "Checked", "Joined", "Rescued", "Deleted", "Freed, up to", "Outcome", "Audit"])
    expect(cells("admin-cleanup-runs-row-run-1").slice(0, 9)).toEqual(["Today, 3:07 AM", "The schedule", "1", "3,413", "3", "1", "0", "0 GB",
      "Finished. 6 shows wait for your approval."])
    expect(cells("admin-cleanup-runs-row-run-2")[8]).toBe("Safety stop: Tautulli did not answerTIMEOUT")
    expect(within(screen.getByTestId("admin-cleanup-runs-row-run-2")).getByText("TIMEOUT")).toHaveClass("font-mono")
    expect(cells("admin-cleanup-runs-row-run-3").slice(0, 9)).toEqual(["Today, 3:07 AM", "You", "1", "3,413", "3", "1", "4", "96 GB",
      "Stopped: the server shut down"])
    const audit = screen.getByTestId("admin-cleanup-runs-link-run-1")
    expect(audit).toHaveAttribute("href", "/admin/audit?run=run-1")
    expect(audit).toHaveAccessibleName("Audit rows of the run at Today, 3:07 AM")
    jest.restoreAllMocks()
  })

  it("says when the first nightly run is with no run yet", () => {
    const { rerender } = render(<HistoryTab data={historyData({ runs: [] })} />)
    expect(screen.getByTestId("admin-cleanup-runs-empty")).toHaveTextContent("No runs yet. The first nightly run is at 3:07 AM.")
    rerender(<HistoryTab data={historyData({ runs: [], nextRunAt: null })} />)
    expect(screen.getByTestId("admin-cleanup-runs-empty")).toHaveTextContent(/^No runs yet\.$/)
  })
})

describe("HistoryTab deleted titles", () => {
  const failed = historyTitle({ id: "out-2", kind: "failed", result: "failed", freedBytes: "0", approvedBy: { id: "u1", name: "Invented Admin", isYou: false },
    cause: "Sonarr refused the delete. It stays in Leaving soon." })
  const unmonitored = historyTitle({ id: "out-3", kind: "rescued", reason: "played", result: "stillUnmonitored", stillUnmonitored: "sonarr", approvedBy: null,
    cause: "A member played it." })

  it("reads a deleted, a failed and a still-unmonitored row of one title, each keyed by its outcome", () => {
    render(<HistoryTab data={historyData({ deleted: [historyTitle(), failed, unmonitored], total: 3 })} />)
    expect(screen.getByRole("heading", { name: "Deleted titles" })).toBeInTheDocument()
    expect(cells("admin-cleanup-deleted-row-out-1").slice(0, 6)).toEqual(["Invented ValleySeason 2", "Old seasons nobody plays", "Nov 7, 2026", "31 GB",
      "Automatic", "Deleted"])
    expect(cells("admin-cleanup-deleted-row-out-2").slice(2, 6)).toEqual(["Nov 7, 2026", "0 GB", "Invented Admin",
      "FailedSonarr refused the delete. It stays in Leaving soon."])
    expect(cells("admin-cleanup-deleted-row-out-3").slice(2, 6)).toEqual(["Not deleted", "None", "No one", "Still unmonitored in SonarrA member played it."])
    expect(screen.getByTestId("admin-cleanup-deleted-row-out-2-why")).toHaveAccessibleName("Why: Invented Valley, Season 2")
    expect(screen.getByTestId("admin-cleanup-deleted-row-out-3-why")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-deleted-filters-count")).toHaveTextContent("3 titles")
  })

  it("opens the stored Why of the outcome, read only, and focus goes back to its button", async () => {
    const user = userEvent.setup()
    render(<HistoryTab data={historyData({ deleted: [historyTitle(), failed], total: 2 })} />)
    await user.click(screen.getByTestId("admin-cleanup-deleted-row-out-2-why"))
    const why = screen.getByTestId("why-stub")
    expect(why).toHaveAttribute("data-outcome", "out-2")
    expect(why).toHaveAttribute("data-surface", "history")
    await user.click(why)
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-deleted-row-out-2-why")).toHaveFocus())
    expect(screen.queryByTestId("why-stub")).not.toBeInTheDocument()
  })

  it("names an approver, and says when no title was deleted or none matches the filters", async () => {
    const user = userEvent.setup()
    expect(approvedWords({ id: "u1", name: "Invented Admin", isYou: true })).toBe("You")
    const { unmount } = render(<HistoryTab data={historyData({ deleted: [], total: 0 })} />)
    expect(screen.getByTestId("admin-cleanup-deleted-empty")).toHaveTextContent("No deleted titles yet")
    unmount()
    resetUrl("/admin/cleanup?tab=history&rule=rule-2")
    render(<HistoryTab data={historyData({ deleted: [], total: 0 })} />)
    expect(screen.getByTestId("admin-cleanup-deleted-empty")).toHaveTextContent("No titles match these filters")
    await user.click(screen.getByTestId("admin-cleanup-deleted-clear-filters"))
    expect(currentHref()).toBe("/admin/cleanup?tab=history")
  })
})
