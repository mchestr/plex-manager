import { num } from "@/lib/rewind/pages/facts"
import { hasSplit, splitShare } from "@/lib/rewind/pages/number"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { axes, u, ut } from "./units"


/**
 * The series and films split on page 02: solid ink for series, hatching for
 * films (design 5.2: never told apart by colour alone). Hidden when either
 * side is zero.
 */
export function NumberSplit({ facts }: { facts: RewindFactsV3 }) {
  if (!hasSplit(facts)) return null
  const series = num(facts, "time.seriesShare")
  const films = num(facts, "time.filmsShare")

  return (
    <div className="font-display" style={{ marginTop: u(14) }} data-testid="rewind-number-split">
      <p className="flex justify-between" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600) }}>
        <span>Shows {splitShare(facts, "series")}</span>
        <span>Movies {splitShare(facts, "films")}</span>
      </p>
      <div aria-hidden className="rw-grow flex" style={{ height: u(24), gap: u(4), marginTop: u(5) }}>
        <span className="bg-current" style={{ flexGrow: series }} />
        <span className="rw-hatch border-[1.5px] border-current" style={{ flexGrow: films }} />
      </div>
    </div>
  )
}
