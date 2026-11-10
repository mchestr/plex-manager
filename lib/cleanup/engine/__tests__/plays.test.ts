/** @jest-environment node */
/**
 * E15: the cleanup copies of `isCountedPlay` and `isFinished` give the same
 * answers as Rewind's on one shared table.
 */

import { isCountedPlay, isFinished } from "@/lib/cleanup/engine/plays"
import {
  isCountedPlay as rewindIsCountedPlay,
  isFinished as rewindIsFinished,
} from "@/lib/wrapped/sources/watch-history-source"

/** One row per edge: seconds played, percent reached, Tautulli watched status. */
const TABLE: [number, number, number][] = [
  [0, 0, 0],
  [70, 95, 0],
  [100, 40, 0],
  [119, 89, 0.5],
  [119, 89.9, 0.75],
  [119, 90, 0],
  [120, 0, 0],
  [121, 10, 1],
  [380, 26, 0.25],
  [6200, 98, 1],
  [30, 50, 1],
  [3600, 89, 0.99],
]

describe("plays", () => {
  it.each(TABLE)("agrees with Rewind on %s s, %s %%, watched %s", (playSeconds, percentComplete, watchedStatus) => {
    expect(isCountedPlay({ playSeconds, percentComplete })).toBe(rewindIsCountedPlay({ playSeconds, percentComplete }))
    expect(isFinished({ watchedStatus, percentComplete })).toBe(rewindIsFinished({ watchedStatus, percentComplete }))
  })

  it("counts 120 s or 90 %, and finishes at watched or 90 %", () => {
    expect(TABLE.map(([s, p]) => isCountedPlay({ playSeconds: s, percentComplete: p }))).toEqual([
      false, true, false, false, false, true, true, true, true, true, false, true,
    ])
    expect(TABLE.map(([, p, w]) => isFinished({ watchedStatus: w, percentComplete: p }))).toEqual([
      false, true, false, false, false, true, false, true, false, true, true, false,
    ])
  })
})
