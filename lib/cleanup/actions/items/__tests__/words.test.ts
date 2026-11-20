/**
 * The words around the item actions (UX 8.6, 8.9): the approval, Postpone and
 * Exclude toasts with `plural()`, the error toasts when nothing was done, and
 * the new leave dates of a Postpone.
 */

import { approvedToast, excludedToast, newLeaveDates, postponedToast } from "@/lib/cleanup/actions/items/words"

describe("item action words", () => {
  it("says when the deletions of an approval start", () => {
    expect(approvedToast(true)).toBe("Batch approved. Deletions start now.")
    expect(approvedToast(false)).toBe("Batch approved. The deletions start at the next nightly run.")
  })

  it.each([
    [{ postponed: 1, skipped: 0 }, 1, "1 title postponed.", false],
    [{ postponed: 3, skipped: 2 }, 5, "3 titles postponed. 2 are being deleted and were skipped.", false],
    [{ postponed: 0, skipped: 1 }, 1, "This title is being deleted. Nothing was postponed.", true],
    [{ postponed: 0, skipped: 4 }, 4, "These titles are being deleted. Nothing was postponed.", true],
  ])("words a Postpone of %o", (counts, selected, text, error) => {
    expect(postponedToast({ ...counts, firstLeaveOn: null, lastLeaveOn: null }, selected)).toEqual({ text, error })
  })

  it.each([
    [{ excluded: 1, skipped: 0 }, 1, "season", "Season excluded.", false],
    [{ excluded: 1, skipped: 0 }, 1, undefined, "1 title excluded.", false],
    [{ excluded: 2, skipped: 1 }, 3, "movie", "2 titles excluded. 1 is being deleted and was skipped.", false],
    [{ excluded: 0, skipped: 2 }, 2, undefined, "These titles are being deleted. Nothing was excluded.", true],
  ] as const)("words an Exclude of %o", (counts, selected, level, text, error) => {
    expect(excludedToast({ ...counts, rescued: 0 }, selected, level)).toEqual({ text, error })
  })

  it("moves each date from the later of its leave date and today", () => {
    expect(newLeaveDates(["2026-11-01", "2026-11-20", null], "2026-11-08", 7)).toEqual({ first: "2026-11-15", last: "2026-11-27" })
    expect(newLeaveDates([], "2026-11-08", 30)).toEqual({ first: "2026-12-08", last: "2026-12-08" })
  })
})
