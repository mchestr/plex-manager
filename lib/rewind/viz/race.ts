/**
 * The race (design 4.3 page 11) as pure geometry: the stored month frames
 * of the member's top series become per-row keyframes the client animator
 * plays with `element.animate()`, and the who-led strip.
 *
 * ## Geometry
 *
 * - **Bars.** Each series' `scaleX` per frame is its cumulative minutes over
 *   the most any series reached, so the final leader's bar is full length.
 *   Cumulative minutes never fall, so neither does a bar.
 * - **Order.** Each frame ranks the series by minutes; a tie keeps that
 *   frame's leader first, then the higher final standing. A row's
 *   `translateY` is its rank times the row pitch.
 * - **Who led.** Consecutive months with the same leader merge into one
 *   segment; a month nobody had started has a null leader.
 *
 * ## Timeline
 *
 * Frames play 520 ms apart (11 frames: 5.72 s). {@link frameKeyframes}
 * holds each value until its frame starts, then tweens to the next over
 * `tweenMs` (420 ms for the bars, 360 ms for the re-order, 0 for the stepped
 * month clock).
 *
 * ```
 *  value │      ┌────────          ┌────
 *        │  ┌───┘                ┌─┘
 *        │──┘                 ───┘
 *        └──┬──────┬──────┬──────┬────── t
 *           0     520   1040   1560
 * ```
 *
 * @module lib/rewind/viz/race
 */

/** One frame of the run. @internal Exported for the tests. */
export const FRAME_MS = 520
export const BAR_TWEEN_MS = 420
export const ORDER_TWEEN_MS = 360

export interface RaceFrame {
  minutes: readonly number[]
  /** The index of the month's leader in the series list, or null. */
  leader: number | null
}

export interface RaceRow {
  /** `scaleX` per frame, 0-1. */
  scale: number[]
  /** `translateY` per frame, in px. */
  offset: number[]
}

export interface LeadSegment {
  /** The first frame of the run. */
  start: number
  length: number
  leader: number | null
}

export interface RaceGeometry {
  rows: RaceRow[]
  /** Series indexes in the last frame's order. */
  finalOrder: number[]
  strip: LeadSegment[]
}

const r = (n: number) => Math.round(n * 10_000) / 10_000

/** Series indexes for one frame, first place first. */
function frameOrder(frame: RaceFrame): number[] {
  return frame.minutes
    .map((_, i) => i)
    .sort((a, b) => frame.minutes[b] - frame.minutes[a] || (a === frame.leader ? -1 : b === frame.leader ? 1 : a - b))
}

/**
 * @example
 * ```ts
 * const race = raceGeometry([{ minutes: [10, 30], leader: 1 }, { minutes: [60, 40], leader: 0 }], { pitch: 50 })
 * race.rows[0] // { scale: [0.1667, 1], offset: [50, 0] }
 * race.strip   // [{ start: 0, length: 1, leader: 1 }, { start: 1, length: 1, leader: 0 }]
 * ```
 */
export function raceGeometry(frames: readonly RaceFrame[], { pitch }: { pitch: number }): RaceGeometry {
  const series = frames[0]?.minutes.length ?? 0
  const max = Math.max(1, ...frames.flatMap((f) => f.minutes))
  const orders = frames.map(frameOrder)
  const rows = Array.from({ length: series }, (_, i) => ({
    scale: frames.map((f) => r(f.minutes[i] / max)),
    offset: orders.map((order) => order.indexOf(i) * pitch),
  }))
  const strip: LeadSegment[] = []
  frames.forEach((frame, m) => {
    const last = strip.at(-1)
    if (last && last.leader === frame.leader) last.length += 1
    else strip.push({ start: m, length: 1, leader: frame.leader })
  })
  return { rows, finalOrder: orders.at(-1) ?? [], strip }
}

/**
 * One animated property across the frames, as `[offset, value]` keyframes
 * for `element.animate()`: starting at `from`, each frame's value is held
 * until the frame starts and reached `tweenMs` later. The run lasts
 * `values.length * FRAME_MS`.
 */
export function frameKeyframes(values: readonly number[], tweenMs: number, from: number): Array<{ offset: number; value: number }> {
  const total = values.length * FRAME_MS
  const out: Array<{ offset: number; value: number }> = [{ offset: 0, value: from }]
  let previous = from
  values.forEach((value, i) => {
    const start = i * FRAME_MS
    if (start > 0) out.push({ offset: r(start / total), value: previous })
    out.push({ offset: r((start + tweenMs) / total), value })
    previous = value
  })
  if (out.at(-1)!.offset < 1) out.push({ offset: 1, value: previous })
  return out
}

/** The run's length for `frames` frames. */
export const raceDurationMs = (frames: number) => frames * FRAME_MS
