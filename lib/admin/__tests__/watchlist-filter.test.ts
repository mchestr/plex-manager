/**
 * The admin watchlist list's URL filters: every filter defaults to All, an
 * unknown value falls back to it, and each status and type names one column
 * value.
 */

import { parseWatchlistFilter, WATCHLIST_STATUS_OF, WATCHLIST_TYPE_OF } from "@/lib/admin/watchlist-filter"
import { STATUS } from "@/lib/ui/status"

describe("parseWatchlistFilter", () => {
  it("defaults every filter to all, with no search", () => {
    expect(parseWatchlistFilter({})).toEqual({ q: "", status: "all", type: "all" })
  })

  it("reads the first value of each param and trims the search", () => {
    expect(parseWatchlistFilter({ q: "  severance ", status: ["notAllowed", "failed"], type: "tv" })).toEqual({
      q: "severance",
      status: "notAllowed",
      type: "tv",
    })
  })

  it("drops values it does not know, and a search past 100 characters", () => {
    expect(parseWatchlistFilter({ status: "REQUESTED", type: "episode", q: "x".repeat(101) })).toEqual({
      q: "",
      status: "all",
      type: "all",
    })
  })
})

describe("the filter values", () => {
  it("name a status the badge vocabulary knows, each once", () => {
    const statuses = Object.values(WATCHLIST_STATUS_OF)
    expect(new Set(statuses).size).toBe(statuses.length)
    for (const status of statuses) expect(Object.keys(STATUS.watchlistSync)).toContain(status)
  })

  it("map films and series to their media types", () => {
    expect(WATCHLIST_TYPE_OF).toEqual({ movie: "MOVIE", tv: "TV_SERIES" })
  })
})
