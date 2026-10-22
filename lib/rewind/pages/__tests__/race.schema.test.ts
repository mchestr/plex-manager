/**
 * 11 The race's stored frames (P8.3's scrubber reads only these): one per
 * month with the runners' cumulative minutes, keys and titles.
 */

import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { racePage } from "@/lib/rewind/pages/race"
import { RaceDataSchema, type RaceData } from "@/lib/rewind/pages/race.schema"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
})

const dataOf = () => heavy.pages.find((p) => p.type === "race")!.data as RaceData

describe("11 The race schema", () => {
  it("stores a frame per month of the season with the runners' keys and titles", () => {
    const data = RaceDataSchema.parse(JSON.parse(JSON.stringify(dataOf())))
    expect(data.frames).toHaveLength(11)
    expect(data.frames.map((f) => f.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(data.series.length).toBeGreaterThanOrEqual(3)
    for (const series of data.series) {
      expect(series.key).toMatch(/^series:/)
      expect(series.title.length).toBeGreaterThan(0)
    }
    for (const frame of data.frames) expect(frame.minutes).toHaveLength(data.series.length)
  })

  it("never lets a runner's minutes shrink from one frame to the next", () => {
    const { frames } = dataOf()
    frames.slice(1).forEach((frame, m) => frame.minutes.forEach((n, i) => expect(n).toBeGreaterThanOrEqual(frames[m].minutes[i])))
  })

  it("rejects shrinking minutes and a frame with a runner missing", () => {
    const data = dataOf()
    const shrunk = { ...data, frames: data.frames.map((f, m) => (m === 5 ? { ...f, minutes: f.minutes.map(() => 0) } : f)) }
    expect(racePage.schema.safeParse(shrunk).success).toBe(false)
    const short = { ...data, frames: data.frames.map((f) => ({ ...f, minutes: f.minutes.slice(0, 2) })) }
    expect(racePage.schema.safeParse(short).success).toBe(false)
  })
})
