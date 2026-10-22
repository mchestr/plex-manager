import { watchlistCountsText } from "@/lib/watchlist/summary"

describe("JSDoc Documentation Examples", () => {
  it("watchlistCountsText matches its example", () => {
    expect(watchlistCountsText({ requested: 3, available: 12, alreadyRequested: 4, skipped: 2, notPermitted: 1 })).toBe(
      "Requested 3, already on the server 12, already requested 4, skipped 2 (no TMDB match), not allowed 1"
    )
  })
})
