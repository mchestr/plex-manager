import { watchlistCountsText } from "@/lib/watchlist/summary"

describe("JSDoc Documentation Examples", () => {
  it("watchlistCountsText matches its example", () => {
    expect(watchlistCountsText({ requested: 3, available: 12, alreadyRequested: 4, skipped: 2, notPermitted: 1 })).toBe(
      "3 requested, 12 already on the server, 4 already requested, 2 couldn't be matched, 1 not allowed"
    )
  })
})
