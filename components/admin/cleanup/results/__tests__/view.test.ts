import {
  DEFAULT_RESULTS_VIEW,
  focusResultsHeading,
  focusResultsTab,
  itemName,
  RESULTS_HEADING_ID,
  sortsOf,
  viewForTab,
} from "@/components/admin/cleanup/results/view"

describe("results view", () => {
  it("offers Closest first only on Near misses, as its default", () => {
    expect(sortsOf("nearMisses")).toEqual(["closest", "largest", "oldestPlay", "title"])
    expect(sortsOf("matches")).toEqual(["largest", "oldestPlay", "title"])
    expect(sortsOf("protected")[0]).toBe("largest")
  })

  it("starts a tab on its default sort, page 1 and no chip, and keeps the search", () => {
    const view = { tab: "nearMisses" as const, sort: "title" as const, search: "x", page: 4, chip: "c1" }
    expect(viewForTab(view, "matches")).toEqual({ tab: "matches", sort: "largest", search: "x", page: 1, chip: null })
    expect(viewForTab(DEFAULT_RESULTS_VIEW, "nearMisses").sort).toBe("closest")
  })

  it("names a season row by its show and number", () => {
    expect(itemName({ title: "Night Ferry", level: "season", seasonNumber: 4 })).toBe("Night Ferry, Season 4")
    expect(itemName({ title: "Night Ferry", level: "season", seasonNumber: null })).toBe("Night Ferry")
    expect(itemName({ title: "Harbor Lights", level: "movie", seasonNumber: null })).toBe("Harbor Lights")
  })

  it("moves focus to the heading and the tabs, and does nothing without them", () => {
    expect(() => focusResultsHeading()).not.toThrow()
    expect(() => focusResultsTab("missing")).not.toThrow()
    document.body.innerHTML = `<h2 id="${RESULTS_HEADING_ID}" tabindex="-1">Results</h2><button data-cleanup-results-tab="missing">Missing</button>`
    focusResultsHeading()
    expect(document.activeElement?.id).toBe(RESULTS_HEADING_ID)
    focusResultsTab("missing")
    expect(document.activeElement?.textContent).toBe("Missing")
    document.body.innerHTML = ""
  })
})
