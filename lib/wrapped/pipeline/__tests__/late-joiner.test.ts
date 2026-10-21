import { firstPlayAt, isLateJoiner } from "@/lib/wrapped/pipeline/late-joiner"

const instant = (iso: string) => Date.parse(iso)

describe("isLateJoiner (design 4.5, GAP-45)", () => {
  // The cut-off is read in the member's zone, never the process zone, so these hold under TZ=UTC as under any other

  it("puts 30 September 23:59 and 1 October 00:00 in Los Angeles on either side", () => {
    // PDT is UTC-7 on both days
    expect(isLateJoiner({ since: instant("2026-10-01T06:59:00Z"), createdAt: null }, 2026, "America/Los_Angeles")).toBe(false)
    expect(isLateJoiner({ since: instant("2026-10-01T07:00:00Z"), createdAt: null }, 2026, "America/Los_Angeles")).toBe(true)
  })

  it("puts 30 September 23:59 and 1 October 00:00 in Sydney on either side", () => {
    // AEST is UTC+10 until daylight saving starts on 4 October
    expect(isLateJoiner({ since: instant("2026-09-30T13:59:00Z"), createdAt: null }, 2026, "Australia/Sydney")).toBe(false)
    expect(isLateJoiner({ since: instant("2026-09-30T14:00:00Z"), createdAt: null }, 2026, "Australia/Sydney")).toBe(true)
  })

  it("reads the account's creation only without a first play", () => {
    const lateAccount = new Date("2026-10-03T12:00:00Z")
    expect(isLateJoiner({ since: instant("2025-04-01T12:00:00Z"), createdAt: lateAccount }, 2026, "UTC")).toBe(false)
    expect(isLateJoiner({ since: null, createdAt: lateAccount }, 2026, "UTC")).toBe(true)
    expect(isLateJoiner({ since: null, createdAt: null }, 2026, "UTC")).toBe(false)
  })

  it("finds the first lifetime play", () => {
    expect(firstPlayAt([{ startedAt: 30 }, { startedAt: 10 }, { startedAt: 20 }])).toBe(10)
    expect(firstPlayAt([])).toBeNull()
    expect(firstPlayAt(null)).toBeNull()
  })
})
