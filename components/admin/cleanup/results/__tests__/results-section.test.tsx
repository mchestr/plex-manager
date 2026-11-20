import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { buildPreview, buildRow, LABELS, NOW } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { ResultsSection } from "@/components/admin/cleanup/results/results-section"
import { DEFAULT_RESULTS_VIEW, type ResultsView } from "@/components/admin/cleanup/results/view"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { PREVIEW_TABS, type PreviewTab } from "@/lib/validations/cleanup-actions"

expect.extend(toHaveNoViolations)

interface HarnessProps {
  data?: Partial<PreviewResponse>
  start?: Partial<ResultsView>
  onViewChange?: jest.Mock
  onWhy?: jest.Mock
  updating?: boolean
}

/** Holds the view as the editor root does. */
function Harness({ data = {}, start = {}, onViewChange = jest.fn(), onWhy = jest.fn(), updating }: HarnessProps) {
  const [view, setView] = useState<ResultsView>({ ...DEFAULT_RESULTS_VIEW, ...start })
  return (
    <ResultsSection
      data={buildPreview(data)}
      view={view}
      onViewChange={(next) => {
        onViewChange(next)
        setView(next)
      }}
      labels={LABELS}
      ruleName="Movies nobody watches"
      now={NOW}
      updating={updating}
      onWhy={onWhy}
    />
  )
}

describe("ResultsSection", () => {
  it("is a section named Results with its heading, line, tabs and rows", () => {
    render(<Harness />)
    const section = screen.getByRole("region", { name: "Results" })
    expect(section).toHaveAttribute("data-testid", "admin-cleanup-results")
    const heading = within(section).getByRole("heading", { level: 2, name: "Results" })
    expect(heading).toHaveAttribute("tabindex", "-1")
    expect(section).toHaveTextContent("The same checks as a run, on the library data from 3:07 AM today. Your unsaved changes count.")
    expect(screen.getByTestId("admin-cleanup-results-tab-matches")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Near misses 41" })).toHaveAttribute("data-testid", "admin-cleanup-results-tab-near-misses")
    expect(screen.getByTestId("admin-cleanup-results-tab-cannot-delete")).toHaveTextContent("Cannot delete 3")
    expect(screen.getByRole("table", { name: "Matches for Movies nobody watches" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-results-count")).toHaveTextContent("197 movies, 1.3 TB")
    expect(screen.queryByTestId("admin-cleanup-results-chips")).not.toBeInTheDocument()
  })

  it("starts a new tab on its default sort, on page 1, with no chip, and keeps the search", async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    render(<Harness onViewChange={onViewChange} start={{ search: "harbor", page: 3, sort: "title" }} />)
    await user.click(screen.getByRole("tab", { name: /^Near misses/ }))
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "nearMisses", sort: "closest", search: "harbor", page: 1, chip: null })
    expect(screen.getByTestId("admin-cleanup-results-chips")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveTextContent("Closest first")
  })

  it("changes the sort, back to page 1", async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    render(<Harness onViewChange={onViewChange} start={{ page: 2 }} />)
    const sort = screen.getByTestId("admin-cleanup-results-sort")
    expect(sort).toHaveTextContent("Largest first")
    await user.click(sort)
    expect(screen.queryByRole("option", { name: "Closest first" })).not.toBeInTheDocument()
    await user.click(await screen.findByRole("option", { name: "Title" }))
    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_RESULTS_VIEW, sort: "title", page: 1 })
    await waitFor(() => expect(sort).toHaveTextContent("Title"))
  })

  it("searches 500 ms after the last key, trimmed, back to page 1", async () => {
    jest.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onViewChange = jest.fn()
      render(<Harness onViewChange={onViewChange} start={{ page: 2 }} />)
      const search = screen.getByRole("searchbox", { name: "Search titles" })
      await user.type(search, " harbor ")
      act(() => jest.advanceTimersByTime(499))
      expect(onViewChange).not.toHaveBeenCalled()
      act(() => jest.advanceTimersByTime(1))
      expect(onViewChange).toHaveBeenCalledTimes(1)
      expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_RESULTS_VIEW, search: "harbor", page: 1 })
      // The box keeps what was typed, spaces included
      expect(search).toHaveValue(" harbor ")
      // The matches bytes are of the whole tab, so a search shows the count alone
      expect(screen.getByTestId("admin-cleanup-results-count")).toHaveTextContent(/^197 movies$/)
      act(() => jest.advanceTimersByTime(1000))
      expect(onViewChange).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it("takes a search that changes outside the box", () => {
    const props = { data: buildPreview(), onViewChange: jest.fn(), labels: LABELS, ruleName: "Rule", now: NOW, onWhy: jest.fn() }
    const { rerender } = render(<ResultsSection {...props} view={{ ...DEFAULT_RESULTS_VIEW, search: "harbor" }} />)
    expect(screen.getByRole("searchbox")).toHaveValue("harbor")
    rerender(<ResultsSection {...props} view={DEFAULT_RESULTS_VIEW} />)
    expect(screen.getByRole("searchbox")).toHaveValue("")
  })

  it("filters near misses by the chips, with the held-back counts", async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    render(<Harness onViewChange={onViewChange} start={{ tab: "nearMisses", sort: "closest", page: 2 }} />)
    expect(screen.getByTestId("admin-cleanup-results-chip-all")).toHaveAccessibleName("All, 41 near misses")
    await user.click(screen.getByTestId("admin-cleanup-results-chip-c1"))
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "nearMisses", sort: "closest", search: "", page: 1, chip: "c1" })
    await user.click(screen.getByTestId("admin-cleanup-results-chip-all"))
    expect(onViewChange).toHaveBeenLastCalledWith({ tab: "nearMisses", sort: "closest", search: "", page: 1, chip: null })
    expect(screen.getByTestId("admin-cleanup-results-count")).toHaveTextContent(/^197 movies$/)
  })

  it("shows 50 rows a page with Show the next 50, and moves focus to the table", async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    const rows = Array.from({ length: 50 }, (_, i) => buildRow({ itemKey: `movie-${i}` }))
    render(<Harness onViewChange={onViewChange} data={{ rows }} />)
    expect(screen.getByText("Showing 1 to 50 of 197 movies")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-results-previous")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show the next 50" }))
    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_RESULTS_VIEW, page: 2 })
    expect(screen.getByRole("table")).toHaveFocus()
  })

  it("goes back a page, and shows the rest on the last page", async () => {
    const user = userEvent.setup()
    const onViewChange = jest.fn()
    const rows = Array.from({ length: 50 }, (_, i) => buildRow({ itemKey: `movie-${i}` }))
    const { unmount } = render(<Harness onViewChange={onViewChange} data={{ rows, page: 3 }} start={{ page: 3 }} />)
    expect(screen.getByText("Showing 101 to 150 of 197 movies")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show the next 47" })).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-results-previous"))
    expect(onViewChange).toHaveBeenLastCalledWith({ ...DEFAULT_RESULTS_VIEW, page: 2 })
    unmount()

    render(<Harness data={{ rows: rows.slice(0, 47), page: 4 }} start={{ page: 4 }} />)
    expect(screen.getByText("Showing 151 to 197 of 197 movies")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-results-next")).not.toBeInTheDocument()
  })

  it.each([
    ["matches", "No matches"],
    ["nearMisses", "No near misses"],
    ["protected", "Nothing is protected"],
    ["missing", "No missing data"],
    ["cannotDelete", "Nothing here that cannot be deleted"],
  ] as [PreviewTab, string][])("says when the %s tab is empty", (tab, words) => {
    render(<Harness data={{ rows: [], total: 0 }} start={{ tab }} />)
    expect(screen.getByTestId("admin-cleanup-results-empty")).toHaveTextContent(words)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument()
  })

  it("shows skeleton rows before the first read of the library", () => {
    render(<Harness data={{ snapshot: null, rows: [], total: 0 }} />)
    expect(screen.getByRole("region", { name: "Results" })).toHaveTextContent("The same checks as a run. Your unsaved changes count.")
    expect(document.querySelector("[data-slot='table-skeleton']")).not.toBeNull()
    expect(screen.queryByTestId("admin-cleanup-results-empty")).not.toBeInTheDocument()
  })

  it("keeps the rows, busy, while a newer preview is on its way", () => {
    render(<Harness updating />)
    expect(screen.getByRole("table").closest("[aria-busy='true']")).not.toBeNull()
  })

  it("opens the Why Sheet of a row", async () => {
    const user = userEvent.setup()
    const onWhy = jest.fn()
    render(<Harness onWhy={onWhy} />)
    await user.click(screen.getByTestId("admin-cleanup-results-row-movie-1002-why"))
    expect(onWhy).toHaveBeenCalledWith("movie-1002")
  })

  it("gives every tab its test id", () => {
    render(<Harness />)
    expect(screen.getAllByRole("tab")).toHaveLength(PREVIEW_TABS.length)
    for (const id of ["matches", "near-misses", "protected", "missing", "cannot-delete"]) {
      expect(screen.getByTestId(`admin-cleanup-results-tab-${id}`)).toBeInTheDocument()
    }
  })

  it("has no axe violations", async () => {
    const { container } = render(<Harness start={{ tab: "nearMisses", sort: "closest" }} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
