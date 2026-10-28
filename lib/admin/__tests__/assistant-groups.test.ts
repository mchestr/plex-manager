/**
 * The assistant history's date groups on the viewer's clock.
 */

import { groupHistory, historyGroup } from "@/lib/admin/assistant-groups"

const now = Date.parse("2026-10-28T09:00:00Z")
const hoursAgo = (hours: number) => now - hours * 60 * 60 * 1000

describe("historyGroup", () => {
  it.each([
    [0, "Today"],
    [9, "Today"],
    [10, "Yesterday"],
    [24 * 2, "Previous 7 days"],
    [24 * 7, "Previous 7 days"],
    [24 * 8, "Previous 30 days"],
    [24 * 30, "Previous 30 days"],
    [24 * 31, "Older"],
  ])("%s hours ago is %s", (hours, group) => {
    expect(historyGroup(hoursAgo(hours), now, "UTC")).toBe(group)
  })

  it("puts a time ahead of the clock in Today", () => {
    expect(historyGroup(now + 60_000, now, "UTC")).toBe("Today")
  })
})

describe("groupHistory", () => {
  it("keeps the newest-first order inside each group and skips empty groups", () => {
    const items = [hoursAgo(1), hoursAgo(2), hoursAgo(24 * 3), hoursAgo(24 * 60)].map((at, i) => ({ id: `c${i}`, lastMessageAt: at }))

    expect(groupHistory(items, now, "UTC")).toEqual([
      { group: "Today", items: [items[0], items[1]] },
      { group: "Previous 7 days", items: [items[2]] },
      { group: "Older", items: [items[3]] },
    ])
  })

  it("returns nothing for no conversations", () => {
    expect(groupHistory([], now, "UTC")).toEqual([])
  })
})
