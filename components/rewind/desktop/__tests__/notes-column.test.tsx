import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { pageNotes } from "@/lib/rewind/notes"
import type { TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { registry, type IssuePageType, type RegistryEntry } from "@/lib/rewind/registry"

import { NotesColumn } from "../notes-column"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
})

const ctx = { locale: "en-US", zone: "server" } as const
const pageOf = (type: IssuePageType) => heavy.pages.find((p) => p.type === type)!
const entryOf = (type: IssuePageType): RegistryEntry => registry[type]

function renderNotes(type: IssuePageType, extra: { showTable?: boolean; onToggleTable?: () => void } = {}) {
  const page = pageOf(type)
  return render(
    <NotesColumn
      folio={String(page.folio).padStart(2, "0")}
      pageName={registry[type].name}
      notes={pageNotes(page, heavy.facts, ctx)}
      table={entryOf(type).table?.(page.data, heavy.facts, ctx) ?? null}
      showTable={extra.showTable ?? false}
      onToggleTable={extra.onToggleTable ?? jest.fn()}
      formats="Story card, 1080 by 1920"
    />
  )
}

describe("NotesColumn (P7.4)", () => {
  it("lists every series on Top shows as a table under the counting rule", () => {
    renderNotes("top-shows")
    const data = pageOf("top-shows").data as TopShowsData
    const all = data.rows.length + (data.more?.length ?? 0)
    expect(data.more?.length).toBeGreaterThan(0)
    expect(all).toBe(heavy.stats.titles.series.length + heavy.stats.titles.moreSeries.length)

    const notes = screen.getByRole("complementary", { name: /^Notes on page \d\d, Top shows$/ })
    expect(within(notes).getByRole("heading", { name: `All ${all} series, ranked by time watched` })).toBeInTheDocument()
    expect(notes).toHaveTextContent(/Counted from .+ to .+ in .+, the server’s time zone\. Rewatches count; trailers and extras do not\./)
    const table = within(notes).getByRole("table")
    expect(within(table).getAllByRole("row")).toHaveLength(all + 1)
    expect(within(table).getByRole("rowheader", { name: String(all) })).toBeInTheDocument()
    expect(table).toHaveTextContent(heavy.facts["series[1].title"]!.display)
    expect(table).toHaveTextContent(data.more!.at(-1)!.title)
    expect(screen.getByTestId("rewind-notes-formats")).toHaveTextContent("Share as Story card, 1080 by 1920")
  })

  it("shows a non-P0 page's srSummary as a paragraph", () => {
    renderNotes("bookends")
    const page = pageOf("bookends")
    expect(screen.getByTestId("rewind-notes-body").textContent).toBe(registry.bookends.srSummary(page.data as never, heavy.facts))
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-notes-table-toggle")).not.toBeInTheDocument()
  })

  it("holds one table per month on the calendar, and Why this? with the 24 hours on the centrefold", () => {
    const { unmount } = renderNotes("calendar")
    expect(screen.getAllByRole("table").length).toBeGreaterThan(1)
    expect(screen.getAllByRole("table")[0]).toHaveAccessibleName(/^January: minutes watched on each day you pressed play/)
    unmount()

    renderNotes("centrefold")
    expect(screen.getByTestId("rewind-article-dl")).toHaveTextContent(/your archetype/)
    expect(screen.getByRole("table")).toHaveAccessibleName(/^Plays by the hour they started/)
  })

  it("swaps the Notes for the page's own table with Show as table", async () => {
    const user = userEvent.setup()
    const onToggleTable = jest.fn()
    const { rerender } = renderNotes("top-shows", { onToggleTable })
    const toggle = screen.getByTestId("rewind-notes-table-toggle")
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await user.click(toggle)
    expect(onToggleTable).toHaveBeenCalledTimes(1)

    const page = pageOf("top-shows")
    rerender(
      <NotesColumn
        folio="05"
        pageName="Top shows"
        notes={pageNotes(page, heavy.facts, ctx)}
        table={entryOf("top-shows").table!(page.data, heavy.facts, ctx)}
        showTable
        onToggleTable={onToggleTable}
        formats={null}
      />
    )
    expect(screen.getByTestId("rewind-notes-body")).toHaveAttribute("data-view", "table")
    expect(screen.getByRole("table")).toHaveAccessibleName(/^Minutes of each series by month/)
    expect(screen.getByTestId("rewind-notes-table-toggle")).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByTestId("rewind-notes-formats")).not.toBeInTheDocument()
  })
})
