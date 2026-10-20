/**
 * The meter (design 5.3, 5.7 item 3): one solid bar for the member's share
 * against a hatched remainder, with a tick for the server median when the
 * aggregate has one.
 *
 * ```
 *  ███████████████▨▨▨▨▨▨▨▨       solid: the member, hatch: the rest
 *            ┃                   tick: the server median
 * ```
 *
 * Pure geometry: `ratio` and `median` are clamped to 0-1.
 *
 * @module lib/rewind/viz/meter
 */

export interface Meter {
  solid: { x: number; width: number }
  rest: { x: number; width: number }
  /** The x of the median tick; null without a median. */
  tick: number | null
  height: number
}

const r = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function meter(ratio: number, { width, height, median }: { width: number; height: number; median: number | null }): Meter {
  const split = r(clamp(ratio) * width)
  return {
    solid: { x: 0, width: split },
    rest: { x: split, width: r(width - split) },
    tick: median === null ? null : r(clamp(median) * width),
    height,
  }
}
