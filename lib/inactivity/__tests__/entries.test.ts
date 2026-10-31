import { parseInactivityEntries } from "@/lib/inactivity/entries"

const entry = {
  userId: "user-1",
  outcome: "removed",
  lastActiveAt: "2026-01-02T03:04:05.000Z",
  lastSeenAt: "2026-01-02T03:04:05.000Z",
}

describe("parseInactivityEntries", () => {
  it("keeps every well-formed entry, with or without a code", () => {
    const rows = [entry, { ...entry, outcome: "failed", code: "busy", lastSeenAt: null }, { ...entry, outcome: "skipped", code: "excluded" }]
    expect(parseInactivityEntries(rows)).toEqual(rows)
  })

  it("drops rows that no longer match the shape", () => {
    expect(
      parseInactivityEntries([
        entry,
        { ...entry, outcome: "deleted" },
        { ...entry, userId: "" },
        { ...entry, lastActiveAt: "yesterday" },
        { ...entry, code: 3 },
        "user-2",
        null,
      ])
    ).toEqual([entry])
  })

  it("reads anything but an array as no entries", () => {
    expect(parseInactivityEntries(null)).toEqual([])
    expect(parseInactivityEntries({ entries: [entry] })).toEqual([])
  })
})
