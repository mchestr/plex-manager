/**
 * 02 The number's stored 2025 series (P7.4): P8.4's Compare with 2025 and the
 * page's Notes read only `lastYearDaily`, so it is stored at generation.
 */

import { FIXTURE_IDS, fixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { NumberDataSchema, type NumberData } from "@/lib/rewind/pages/number.schema"

jest.mock("server-only", () => ({}))

const numberData = async (id: string) => (await fixtureIssue(id)).pages.find((p) => p.type === "number")?.data as NumberData | undefined

describe("02 The number schema", () => {
  it("stores last year's daily minutes over the same window on the heavy fixture", async () => {
    const issue = await fixtureIssue("heavy")
    const data = NumberDataSchema.parse(JSON.parse(JSON.stringify(issue.pages.find((p) => p.type === "number")!.data)))
    expect(data.lastYearDaily).toEqual(issue.stats.totals.minutes2025)
    expect(data.lastYearDaily!.length).toBe(data.minutes.length)
    expect(data.lastYearDaily!.some((m) => m > 0)).toBe(true)
  })

  it("leaves it out for a member with no history before 2026", async () => {
    const ids = []
    for (const id of FIXTURE_IDS) {
      const issue = await fixtureIssue(id)
      if (issue.stats.totals.minutes2025 === null && issue.pages.some((p) => p.type === "number")) ids.push(id)
    }
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(await numberData(id)).not.toHaveProperty("lastYearDaily")
  })

  it("still parses an issue stored before the field", () => {
    expect(NumberDataSchema.safeParse({ hero: "time.totalHours", minutes: [0, 30] }).success).toBe(true)
  })
})
