/**
 * @jest-environment node
 */

/**
 * `selectArchetype` over controlled scores: the volume gates, the fixed
 * tie-break and the hash for an all-zero member, the 5-point rule and
 * rarity's 10-member floor.
 */

import { LOW_VOLUME_SHORTLIST, TIE_BREAK_ORDER, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { ArchetypeScore } from "@/lib/wrapped/archetypes/scorers"
import { isPostcard, selectArchetype } from "@/lib/wrapped/archetypes/select"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

let mockScores: Partial<Record<ArchetypeId, number>> = {}

jest.mock("@/lib/wrapped/archetypes/scorers", () => {
  const { ARCHETYPE_IDS: ids } = jest.requireActual<typeof import("@/lib/wrapped/archetypes/catalogue")>(
    "@/lib/wrapped/archetypes/catalogue"
  )
  return {
    scoreArchetypes: () =>
      Object.fromEntries(
        ids.map((id) => [id, { score: mockScores[id] ?? 0, evidence: ["time.totalHours"] } satisfies ArchetypeScore])
      ),
  }
})

/** Only the two figures the gates read. */
const member = (minutes: number, plays: number) => ({ totals: { totalMinutes: minutes }, plays }) as unknown as MemberStats
const heavy = member(78_420, 1258)
const select = (stats: MemberStats, counts: Parameters<typeof selectArchetype>[1]["counts"] = null, userId = "u1") =>
  selectArchetype(stats, { userId, year: 2026, counts })

beforeEach(() => {
  mockScores = {}
})

describe("volume gates", () => {
  it("gives the postcard no archetype: under 30 minutes, or no counted play", () => {
    mockScores = { "midnight-marathoner": 90 }

    expect(select(member(29, 3))).toBeNull()
    expect(select(member(600, 0))).toBeNull()
    expect(isPostcard(member(30, 1))).toBe(false)
    expect(select(member(30, 1))).not.toBeNull()
  })

  it.each([
    ["under 5 hours", member(299, 40)],
    ["under 10 plays", member(900, 9)],
  ])("offers only the low-volume shortlist %s", (_label, stats) => {
    mockScores = { "midnight-marathoner": 99, explorer: 20, curator: 10 }

    const pick = select(stats)!
    expect(pick.id).toBe("explorer")
    expect(pick.shortlist.map((s) => s.id).every((id) => LOW_VOLUME_SHORTLIST.includes(id))).toBe(true)
  })

  it("opens every archetype at 5 hours and 10 plays", () => {
    mockScores = { "midnight-marathoner": 99, explorer: 20 }

    expect(select(member(300, 10))?.id).toBe("midnight-marathoner")
  })

  it("needs an hour for the Casual Critic", () => {
    mockScores = { "casual-critic": 90, curator: 10 }

    expect(select(member(59, 12))?.id).toBe("curator")
    expect(select(member(60, 12))?.id).toBe("casual-critic")
  })
})

describe("ranking", () => {
  it("breaks a tie by the fixed order, whoever the member is", () => {
    mockScores = { "golden-hour-viewer": 80, "festival-juror": 80, loyalist: 80 }
    const order = ["loyalist", "festival-juror", "golden-hour-viewer"]
    expect([...order].sort((a, b) => TIE_BREAK_ORDER.indexOf(a as ArchetypeId) - TIE_BREAK_ORDER.indexOf(b as ArchetypeId))).toEqual(order)

    for (const userId of ["u1", "u2", "u3"]) {
      expect(select(heavy, null, userId)).toMatchObject({ id: "loyalist", runnerUp: "festival-juror" })
    }
  })

  it("picks an all-zero member by hash(userId, year): stable, and not the same for everyone", () => {
    const picks = Array.from({ length: 12 }, (_, i) => select(heavy, null, `user-${i}`)!.id)

    expect(select(heavy, null, "user-3")!.id).toBe(picks[3])
    expect(new Set(picks).size).toBeGreaterThan(1)
  })

  it("lets the LLM choose only when the top 3 are within 5 points", () => {
    mockScores = { "midnight-marathoner": 80, "series-devourer": 77, loyalist: 75, explorer: 10 }
    expect(select(heavy)).toMatchObject({
      id: "midnight-marathoner",
      llmMayChoose: true,
      shortlist: [
        { id: "midnight-marathoner", score: 80 },
        { id: "series-devourer", score: 77 },
        { id: "loyalist", score: 75 },
      ],
    })

    mockScores = { "midnight-marathoner": 80, "series-devourer": 77, loyalist: 74 }
    expect(select(heavy)?.llmMayChoose).toBe(false)
  })
})

describe("rarity", () => {
  it("is null with 9 scored members and read from the counts with 10", () => {
    mockScores = { "midnight-marathoner": 80 }
    const counts = { "midnight-marathoner": 6, loyalist: 3 }

    expect(select(heavy, { archetypeCounts: counts, scoredMembers: 9 })?.rarity).toBeNull()
    expect(select(heavy, { archetypeCounts: null, scoredMembers: 31 })?.rarity).toBeNull()
    expect(select(heavy, { archetypeCounts: { ...counts, explorer: 1 }, scoredMembers: 10 })?.rarity).toEqual({ count: 6, of: 10 })
  })
})
