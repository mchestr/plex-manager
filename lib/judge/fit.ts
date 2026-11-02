/**
 * Fitting the judge prompt's pieces into a budget of characters.
 *
 * A section (the assistant's context, or the newest turn) is drawn by a
 * function that passes every piece of content through a {@link Fit}.
 * {@link fitSection} draws it whole when it fits in its budget. Else a bare
 * draw (every piece empty and marked cut, plus a character each for the
 * neutralising after a cut) measures the section's fixed text, and the pieces
 * share the rest: short ones stay whole and long ones are cut to one length.
 * Each piece says how many of its characters it kept, so the caller can turn
 * down a section cut too far (the newest turn's floor,
 * `lib/judge/build-prompt.ts`).
 *
 * @module lib/judge/fit
 */

import { neutralise, TRUNCATED } from "@/lib/judge/fence"

/** Takes a neutralised piece, cut to `limit` and to what is left of the section's budget; `kept` is how many of its characters stayed. */
export type Fit = (text: string, limit?: number) => { text: string; cut: boolean; kept: number }

/** A cut can leave a partial closing tag at its end, so the kept text is neutralised again: at most one character longer. */
export function fitWithin(budget: number, share = Infinity): Fit {
  return (text, limit = Infinity) => {
    const kept = Math.min(text.length, Math.max(0, Math.min(limit, share, budget)))
    budget -= kept
    return kept === text.length ? { text, cut: false, kept } : { text: neutralise(text.slice(0, kept)), cut: true, kept }
  }
}

/** The piece, with the `[truncated]` mark on the line after it when it was cut. */
export const marked = ({ text, cut }: ReturnType<Fit>) => (cut ? `${text}\n${TRUNCATED}` : text)

/** The largest length to cut every piece to so that their sizes sum to at most `room`. */
function fairShare(sizes: number[], room: number): number {
  const sorted = [...sizes].sort((a, b) => a - b)
  let left = room
  for (const [i, size] of sorted.entries()) {
    const share = Math.floor(left / (sorted.length - i))
    if (size > share) return share
    left -= size
  }
  return Infinity
}

/**
 * Drawn whole when it fits in `budget`. Else a bare draw (every piece empty and
 * marked cut, plus a character each for the neutralising after a cut) measures
 * the fixed text, and the pieces share the rest. The caller checks it still
 * fits, and whether its pieces kept enough.
 */
export function fitSection<Drawn extends { text: string }>(draw: (fit: Fit) => Drawn, budget: number): Drawn {
  const whole = draw(fitWithin(Infinity))
  if (whole.text.length <= budget) return whole
  const sizes: number[] = []
  const bare = draw((text, limit = Infinity) => {
    sizes.push(Math.min(text.length, limit))
    return { text: "", cut: true, kept: 0 }
  })
  const room = budget - bare.text.length - sizes.length
  return draw(fitWithin(room, fairShare(sizes, room)))
}
