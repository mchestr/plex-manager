/**
 * The newest runs: each opens its audit events from its start time, and
 * reads who started it, its counts and its outcome, with the read's failure
 * code and the members whose removal failed under the outcome.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { RunsTable } from "@/components/admin/inactivity/runs-table"
import type { InactivityRunRow } from "@/lib/data/inactivity"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const RUN: InactivityRunRow = {
  id: "run-1",
  startedAt: new Date("2026-10-31T02:17:00Z"),
  finishedAt: new Date("2026-10-31T02:18:00Z"),
  trigger: "scheduled",
  tautulliUsers: 1250,
  matched: 1200,
  qualified: 3,
  removed: 2,
  failed: 1,
  blocked: null,
  error: null,
  failedMembers: ["Ana Lopez"],
}

/** Each cell's value, without the label a card shows above it. */
const cells = (id: string) =>
  within(screen.getByTestId(`admin-inactivity-runs-row-${id}`))
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.replace(cell.querySelector('[data-slot="cell-label"]')?.textContent ?? "", ""))

beforeEach(() => resetUrl("/admin/inactivity"))

describe("RunsTable", () => {
  it("links each run to its audit events and reads its counts and outcome", () => {
    render(<RunsTable runs={[RUN, { ...RUN, id: "run-0", trigger: "admin", failed: 0, failedMembers: [] }]} />)

    expect(screen.getByRole("table", { name: "Recent runs" })).toBeInTheDocument()
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Started",
      "Started by",
      "Tautulli users",
      "Members found",
      "Removed",
      "Failed",
      "Outcome",
    ])
    const link = screen.getByTestId("admin-inactivity-run-run-1")
    expect(link).toHaveAttribute("href", "/admin/audit?run=run-1")
    expect(within(link).getByTestId("admin-inactivity-run-run-1-timestamp")).toHaveAttribute("dateTime", "2026-10-31T02:17:00.000Z")
    expect(cells("run-1").slice(1)).toEqual(["The schedule", "1,250", "1,200", "2", "1", "Removed 2 of 3 membersNot removed: Ana Lopez"])
    expect(cells("run-0").slice(1, 2)).toEqual(["An admin"])
    expect(screen.getByTestId("admin-inactivity-runs-pagination-info")).toHaveTextContent("Showing all 2 runs")
  })

  it("names why a run removed no one, with the read's failure code", () => {
    render(
      <RunsTable
        runs={[{ ...RUN, tautulliUsers: 0, matched: 0, qualified: 0, removed: 0, failed: 0, blocked: "sync_failed", error: "TIMEOUT", failedMembers: [] }]}
      />
    )

    expect(cells("run-1").at(-1)).toBe("Tautulli did not answerTIMEOUT")
  })

  it("says a run without a finish time has not finished", () => {
    render(<RunsTable runs={[{ ...RUN, finishedAt: null, failedMembers: [] }]} />)

    expect(cells("run-1").at(-1)).toBe("Not finished")
  })

  it("says there is no run yet", () => {
    render(<RunsTable runs={[]} />)

    expect(screen.getByTestId("admin-inactivity-runs-empty")).toHaveTextContent("No runs yet")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
