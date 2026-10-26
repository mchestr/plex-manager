import { parseEntries, summaryLine, type RequestTierEntry } from "../entries"

const quota = { movieQuotaLimit: 4, movieQuotaDays: 7, tvQuotaLimit: 2, tvQuotaDays: 7 }
const entry = (patch: Partial<RequestTierEntry>): RequestTierEntry => ({
  overseerrUserId: 1,
  name: "Sam",
  hours: 31,
  tier: 2,
  status: "updated",
  oldQuota: { movieQuotaLimit: null, movieQuotaDays: null, tvQuotaLimit: null, tvQuotaDays: null },
  newQuota: quota,
  ...patch,
})

describe("summaryLine", () => {
  it("matches the Windmill summary", () => {
    expect(summaryLine(entry({}))).toBe("Updated Sam (31.0h) -> Tier 2: 4 movies/week, 2 TV/week")
  })

  it("names the other outcomes", () => {
    expect(summaryLine(entry({ status: "unchanged" }))).toMatch(/^Unchanged Sam/)
    expect(summaryLine(entry({ status: "excluded", hours: null, tier: null, newQuota: null }))).toBe("Skipped Sam (excluded)")
    expect(summaryLine(entry({ status: "failed", hours: null, tier: null, newQuota: null }))).toBe("Failed Sam")
  })
})

describe("parseEntries", () => {
  it("keeps valid rows and drops the rest", () => {
    expect(parseEntries([entry({}), { nope: true }])).toEqual([entry({})])
    expect(parseEntries(null)).toEqual([])
  })
})
