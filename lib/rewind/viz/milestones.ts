/**
 * Milestone marks on the soundtrack (design 5.7, item 7): the x of the day
 * each milestone was passed, at the centre of that day's column, on the same
 * scale as `soundtrack()`. The dates come from the `time.milestones[n].date`
 * facts, so the mark and its label can never disagree.
 *
 * @module lib/rewind/viz/milestones
 */

const DAY_MS = 86_400_000

/**
 * @example
 * ```ts
 * milestoneMarks(["2026-01-01", "2026-01-03"], { from: "2026-01-01", days: 4, width: 8 })
 * // [{ date: "2026-01-01", x: 1 }, { date: "2026-01-03", x: 5 }]
 * ```
 */
export function milestoneMarks(dates: readonly string[], { from, days, width }: { from: string; days: number; width: number }) {
  const start = Date.parse(`${from}T00:00:00Z`)
  return dates.map((date) => {
    const day = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / DAY_MS)
    return { date, x: Math.round(((day + 0.5) * width * 100) / days) / 100 }
  })
}
