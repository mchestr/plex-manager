import { genreColumn } from "@/lib/rewind/viz/column"
import { decadeStrip } from "@/lib/rewind/viz/decade-strip"
import { BAR_TWEEN_MS, FRAME_MS, frameKeyframes, raceDurationMs, raceGeometry, type RaceFrame } from "@/lib/rewind/viz/race"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"

jest.mock("server-only", () => ({}))

const PITCH = 56

/** Eleven months of three series: B leads until October, then A takes November. */
const FRAMES: RaceFrame[] = Array.from({ length: 11 }, (_, m) => {
  const a = m < 9 ? 0 : (m - 8) * 900
  const b = (m + 1) * 120
  const c = (m + 1) * 60
  return { minutes: [a, b, c], leader: a > b ? 0 : 1 }
})

describe("raceGeometry", () => {
  const race = raceGeometry(FRAMES, { pitch: PITCH })

  it("has a value per frame for every runner", () => {
    expect(race.rows).toHaveLength(3)
    for (const row of race.rows) {
      expect(row.scale).toHaveLength(11)
      expect(row.offset).toHaveLength(11)
    }
  })

  it("never shrinks a bar, and the final leader's bar is full length", () => {
    for (const row of race.rows) row.scale.slice(1).forEach((s, m) => expect(s).toBeGreaterThanOrEqual(row.scale[m]))
    expect(race.rows[race.finalOrder[0]].scale.at(-1)).toBe(1)
  })

  it("offsets each row by its rank in the frame", () => {
    FRAMES.forEach((frame, m) => {
      const ranked = [0, 1, 2].sort((x, y) => frame.minutes[y] - frame.minutes[x])
      ranked.forEach((series, rank) => expect(race.rows[series].offset[m]).toBe(rank * PITCH))
    })
    expect(race.finalOrder).toEqual([0, 1, 2])
  })

  it("puts the month's leader first on a tie", () => {
    const tie = raceGeometry([{ minutes: [100, 100, 10], leader: 1 }], { pitch: 10 })
    expect(tie.rows.map((r) => r.offset[0])).toEqual([10, 0, 20])
  })

  it("merges the who-led strip into runs", () => {
    expect(race.strip).toEqual([
      { start: 0, length: 10, leader: 1 },
      { start: 10, length: 1, leader: 0 },
    ])
  })

  it("is deterministic", () => {
    expect(raceGeometry(FRAMES, { pitch: PITCH })).toEqual(race)
  })
})

describe("frameKeyframes", () => {
  it("holds each frame's value, then tweens to the next one", () => {
    const keyframes = frameKeyframes([0.5, 1], BAR_TWEEN_MS, 0)
    const total = 2 * FRAME_MS
    expect(keyframes).toEqual([
      { offset: 0, value: 0 },
      { offset: Math.round((BAR_TWEEN_MS / total) * 10_000) / 10_000, value: 0.5 },
      { offset: 0.5, value: 0.5 },
      { offset: Math.round(((FRAME_MS + BAR_TWEEN_MS) / total) * 10_000) / 10_000, value: 1 },
      { offset: 1, value: 1 },
    ])
    for (const [a, b] of keyframes.slice(1).map((k, i) => [keyframes[i], k])) expect(b.offset).toBeGreaterThanOrEqual(a.offset)
  })

  it("runs 5.72 s for the season's 11 frames", () => {
    expect(raceDurationMs(11)).toBe(5720)
  })
})

describe("genreColumn and decadeStrip", () => {
  it("draws the top genre solid at full length and the rest hatched in proportion", () => {
    expect(genreColumn([0.41, 0.22], { measure: 358 })).toEqual([
      { width: 358, solid: true },
      { width: 192.1, solid: false },
    ])
  })

  it("sizes the decades by titles and marks the median year inside its decade", () => {
    const strip = decadeStrip(
      [
        { decade: 2020, titles: 3 },
        { decade: 2010, titles: 1 },
      ],
      { year: 2022, label: "2022" },
      { width: 358, metrics: pageMetrics }
    )
    expect(strip.segments.map((s) => [s.label, s.width, s.median])).toEqual([
      ["2010s", 89.5, false],
      ["2020s", 268.5, true],
    ])
    expect(strip.marker?.x).toBe(156.63)
    expect(strip.marker?.fit.lines.map((l) => l.text)).toEqual(["2022"])
  })
})
