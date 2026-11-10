/**
 * The words for an answer that takes the place of a report: when the next
 * episode comes out, or which seasons aren't on the server.
 */

import { missingAnswerWords } from "@/lib/problem-reports/answers"

const day = (iso: string) => `day(${iso})`

describe("missingAnswerWords", () => {
  it("says when the next episode comes out, or that it hasn't aired", () => {
    expect(missingAnswerWords({ kind: "NOT_AIRED", season: 2, episode: 6, airsAt: "2026-11-14T02:00:00Z" }, day)).toBe("Season 2, episode 6 comes out day(2026-11-14T02:00:00Z).")
    expect(missingAnswerWords({ kind: "NOT_AIRED", season: 2, episode: 7, airsAt: null }, day)).toBe("Season 2, episode 7 hasn't aired yet.")
  })

  it("names the seasons that aren't on the server", () => {
    expect(missingAnswerWords({ kind: "NOT_ON_SERVER", seasons: [3], requestHref: null }, day)).toBe("Season 3 isn't on the server.")
    expect(missingAnswerWords({ kind: "NOT_ON_SERVER", seasons: [3, 4], requestHref: null }, day)).toBe("Seasons 3 and 4 aren't on the server.")
    expect(missingAnswerWords({ kind: "NOT_ON_SERVER", seasons: [2, 3, 4], requestHref: null }, day)).toBe("Seasons 2, 3 and 4 aren't on the server.")
  })
})
