/**
 * `splitMemberItems` and `homeRow` (TS 13.3 steps 5 and 8, UX 9.2 and 9.3):
 * titles with a reason go to For you, the rest to date groups, the due group
 * first, and the Home row takes 12, For you first. No item holds a size.
 */

import { homeRow, leaveAtOf, type MemberEntry, memberItemRef, type MemberItemRow, splitMemberItems } from "@/lib/cleanup/member/groups"

const TODAY = "2026-11-08"

const row = (n: number, patch: Partial<MemberItemRow> = {}): MemberItemRow => ({
  itemKey: `movie:tmdb:${n}`, level: "movie", title: `Invented title ${n}`, year: 2000 + n, seasonNumber: null,
  episodeCount: null, seasonCount: null, ratingKey: `${7000 + n}`, sectionId: "1", leaveOn: "2026-11-19", ...patch,
})
const entry = (n: number, patch: Partial<MemberItemRow> = {}, extra: Partial<MemberEntry> = {}): MemberEntry => ({
  row: row(n, patch), reason: null, kept: false, ...extra,
})
const REQUESTED = { reason: "requested", reasonAt: "2025-03-14T12:00:00.000Z" } as const

describe("leaveAtOf", () => {
  it("is due on and after the leave day, and with no day", () => {
    expect(leaveAtOf("2026-11-07", TODAY)).toBe("due")
    expect(leaveAtOf(TODAY, TODAY)).toBe("due")
    expect(leaveAtOf(null, TODAY)).toBe("due")
    expect(leaveAtOf("2026-11-09", TODAY)).toBe("2026-11-09")
  })
})

describe("memberItemRef", () => {
  it("copies the title with the poster key and no size", () => {
    expect(memberItemRef(row(1, { level: "season", seasonNumber: 4, episodeCount: 22 }))).toEqual({
      itemKey: "movie:tmdb:1", level: "season", title: "Invented title 1", year: 2001, seasonNumber: 4, episodeCount: 22,
      seasonCount: null, posterKey: "7001", sectionId: "1", sizeBytes: null,
    })
  })

  it("leaves out a row whose level is not known", () => {
    expect(memberItemRef(row(1, { level: "episode" }))).toBeNull()
  })
})

describe("splitMemberItems", () => {
  it("puts titles with a reason under For you, in the input order, with their leave line", () => {
    const { forYou, groups } = splitMemberItems(
      [entry(1, { leaveOn: "2026-11-01" }, { reason: REQUESTED }), entry(2), entry(3, {}, { reason: REQUESTED, kept: true })],
      TODAY
    )
    expect(forYou.map((item) => [item.item.itemKey, item.reason, item.reasonAt, item.leaveAt, item.kept])).toEqual([
      ["movie:tmdb:1", "requested", "2025-03-14T12:00:00.000Z", "due", false],
      ["movie:tmdb:3", "requested", "2025-03-14T12:00:00.000Z", "2026-11-19", true],
    ])
    expect(groups.map((group) => group.items.map((item) => item.item.itemKey))).toEqual([["movie:tmdb:2"]])
  })

  it("groups the rest by leave day, the due group first and then the soonest day", () => {
    const { groups } = splitMemberItems(
      [
        entry(1, { leaveOn: "2026-11-02" }),
        entry(2, { leaveOn: TODAY }),
        entry(3, { leaveOn: "2026-11-19" }),
        entry(4, { leaveOn: "2026-11-12" }),
        entry(5, { leaveOn: "2026-11-19" }),
      ],
      TODAY
    )
    expect(groups.map((group) => [group.date, group.count, group.items.map((item) => item.item.itemKey)])).toEqual([
      ["due", 2, ["movie:tmdb:1", "movie:tmdb:2"]],
      ["2026-11-12", 1, ["movie:tmdb:4"]],
      ["2026-11-19", 2, ["movie:tmdb:3", "movie:tmdb:5"]],
    ])
    expect(groups[0]?.items[0]?.leaveAt).toBe("due")
  })

  it("sorts the due group first whatever the order it was met in", () => {
    const { groups } = splitMemberItems([entry(1, { leaveOn: "2026-11-12" }), entry(2, { leaveOn: "2026-11-01" }), entry(3, { leaveOn: "2026-11-10" })], TODAY)
    expect(groups.map((group) => group.date)).toEqual(["due", "2026-11-10", "2026-11-12"])
  })

  it("leaves out a row whose level is not known", () => {
    expect(splitMemberItems([entry(1, { level: "episode" }, { reason: REQUESTED })], TODAY)).toEqual({ forYou: [], groups: [] })
  })
})

describe("homeRow", () => {
  it("takes 12 titles, For you first, then the groups in order, with the totals", () => {
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => entry(i + 1, {}, { reason: REQUESTED })),
      ...Array.from({ length: 12 }, (_, i) => entry(i + 10, { leaveOn: i < 2 ? "2026-11-01" : "2026-11-19" })),
    ]
    const { forYou, groups } = splitMemberItems(entries, TODAY)
    const result = homeRow(forYou, groups)
    expect(result.total).toBe(15)
    expect(result.forYouCount).toBe(3)
    expect(result.items).toHaveLength(12)
    expect(result.items.slice(0, 4).map((item) => [item.item.itemKey, item.forYou, item.leaveAt])).toEqual([
      ["movie:tmdb:1", true, "2026-11-19"],
      ["movie:tmdb:2", true, "2026-11-19"],
      ["movie:tmdb:3", true, "2026-11-19"],
      ["movie:tmdb:10", false, "due"],
    ])
  })

  it("is empty with no title", () => {
    expect(homeRow([], [])).toEqual({ items: [], total: 0, forYouCount: 0 })
  })
})
