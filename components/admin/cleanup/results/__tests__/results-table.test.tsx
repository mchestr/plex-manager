import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildRow } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { requestedWords, ResultsTable } from "@/components/admin/cleanup/results/results-table"
import type { PreviewRow } from "@/lib/cleanup/types/preview"
import { bindFormat } from "@/lib/utils/format"
import type { PreviewSort, PreviewTab } from "@/lib/validations/cleanup-actions"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

function renderTable(rows: PreviewRow[] = [buildRow()], props: { tab?: PreviewTab; sort?: PreviewSort; level?: "movie" | "show" } = {}) {
  const onWhy = jest.fn()
  render(
    <ResultsTable
      rows={rows}
      tab={props.tab ?? "matches"}
      level={props.level ?? "movie"}
      sort={props.sort ?? "largest"}
      caption="Matches for Movies nobody watches"
      f={f}
      onWhy={onWhy}
    />
  )
  return { onWhy }
}

describe("ResultsTable", () => {
  it("is a table with a caption and the columns of UX 4.3.7", () => {
    renderTable()
    const table = screen.getByRole("table", { name: "Matches for Movies nobody watches" })
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent)
    expect(headers).toEqual(["Title", "Why it matches", "Size", "Last played", "Added", "Requested by", "Why"])
    expect(table).toHaveAttribute("tabindex", "-1")
  })

  it("shows a row's title, year, level, Why text, size and dates", () => {
    renderTable()
    const row = screen.getByTestId("admin-cleanup-results-row-movie-1001")
    const cells = within(row).getAllByRole("cell")
    expect(cells[0]).toHaveTextContent("Harbor Lights (2022)Movies")
    expect(cells[1]).toHaveTextContent("Never played. Added Feb 2023. Nobody requested it.")
    expect(within(cells[1]).getByText("Never played.").tagName).toBe("STRONG")
    expect(cells[2]).toHaveTextContent("22.4 GB")
    expect(cells[3]).toHaveTextContent("Never")
    expect(cells[4]).toHaveTextContent("Feb 9, 2023")
    expect(cells[5]).toHaveTextContent("Nobody")
  })

  it("makes Why the one action of a row, named by the title", async () => {
    const user = userEvent.setup()
    const { onWhy } = renderTable([buildRow({ itemKey: "season-55-4", level: "season", title: "Night Ferry", seasonNumber: 4, year: null })])
    const row = screen.getByTestId("admin-cleanup-results-row-season-55-4")
    expect(row).not.toHaveAttribute("onclick")
    expect(within(row).getAllByRole("button")).toHaveLength(1)
    const why = within(row).getByRole("button", { name: "Why: Night Ferry, Season 4" })
    expect(why).toHaveTextContent("Why")
    expect(why).toHaveAttribute("data-testid", "admin-cleanup-results-row-season-55-4-why")
    await user.click(why)
    expect(onWhy).toHaveBeenCalledWith("season-55-4")
    expect(row).toHaveTextContent("Night Ferry, Season 4Seasons")
  })

  it("says unknown values, plays and requesters in words", () => {
    renderTable([
      buildRow({ itemKey: "movie-1", sizeBytes: null, lastPlayedAt: null, addedAt: null, requestedBy: null }),
      buildRow({ itemKey: "movie-2", lastPlayedAt: "2024-08-14T20:00:00.000Z", requestedBy: "importList" }),
    ])
    const unknown = within(screen.getByTestId("admin-cleanup-results-row-movie-1")).getAllByRole("cell")
    expect(unknown[2]).toHaveTextContent("Unknown")
    expect(unknown[3]).toHaveTextContent("Unknown")
    expect(unknown[4]).toHaveTextContent("Unknown")
    expect(unknown[5]).toHaveTextContent("Unknown")
    const played = within(screen.getByTestId("admin-cleanup-results-row-movie-2")).getAllByRole("cell")
    expect(played[3]).toHaveTextContent("Aug 14, 2024")
    expect(played[5]).toHaveTextContent("Nobody (import list)")
  })

  it("lists several requesters, each on its own line on a desktop", () => {
    renderTable([
      buildRow({
        requestedBy: [
          { name: "Avery Lark", status: "former", at: "2025-07-12T00:00:00.000Z" },
          { name: "Jun Park", status: "member", at: "2024-03-03T00:00:00.000Z" },
        ],
      }),
    ])
    const cell = within(screen.getByTestId("admin-cleanup-results-row-movie-1001")).getAllByRole("cell")[5]
    expect(cell).toHaveTextContent("Requested by: Avery Lark, former member; Jun Park, Mar 2024")
  })

  it("says the requesters as UX 8.4 does", () => {
    expect(requestedWords("none", f)).toEqual(["Nobody"])
    expect(requestedWords([], f)).toEqual(["Nobody"])
    expect(requestedWords("importList", f)).toEqual(["Nobody (import list)"])
    expect(requestedWords(null, f)).toEqual(["Unknown"])
    expect(requestedWords([{ name: "Unknown member", status: "unknown", at: "2025-01-01T00:00:00.000Z" }], f)).toEqual(["Unknown member"])
  })

  it("names the Why column by tab and the played column by level", () => {
    renderTable([buildRow()], { tab: "nearMisses", level: "show" })
    expect(screen.getByRole("columnheader", { name: "Why it does not match" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Last played (any episode)" })).toBeInTheDocument()
  })

  it.each([
    ["largest", "Size", "descending"],
    ["title", "Title", "ascending"],
    ["oldestPlay", "Last played", "ascending"],
  ] as const)("marks the column that %s sorts", (sort, column, direction) => {
    renderTable([buildRow()], { sort })
    expect(screen.getByRole("columnheader", { name: column })).toHaveAttribute("aria-sort", direction)
    expect(screen.getAllByRole("columnheader").filter((th) => th.hasAttribute("aria-sort"))).toHaveLength(1)
  })

  it("marks no column for closest first", () => {
    renderTable([buildRow()], { sort: "closest", tab: "nearMisses" })
    expect(screen.getAllByRole("columnheader").filter((th) => th.hasAttribute("aria-sort"))).toHaveLength(0)
  })

  it.each([
    ["protected", "What keeps it safe"],
    ["missing", "What is unknown"],
    ["cannotDelete", "Why it cannot be deleted"],
  ] as const)("heads the Why column of %s", (tab, heading) => {
    renderTable([buildRow()], { tab })
    expect(screen.getByRole("columnheader", { name: heading })).toBeInTheDocument()
  })
})
