import { has, num, shown } from "@/lib/rewind/pages/facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { axes, u, ut } from "./units"

/** "Series 872 h, 67%", or "Series 4%" under an hour. */
function label(facts: RewindFactsV3, name: string, hours: "time.seriesHours" | "time.filmsHours", share: "time.seriesShare" | "time.filmsShare") {
  return has(facts, hours) ? `${name} ${shown(facts, hours)} h, ${shown(facts, share)}` : `${name} ${shown(facts, share)}`
}

/**
 * The series and films split on page 02: solid ink for series, hatching for
 * films (design 5.2: never told apart by colour alone). Hidden when either
 * side is zero.
 */
export function NumberSplit({ facts }: { facts: RewindFactsV3 }) {
  const series = num(facts, "time.seriesShare")
  const films = num(facts, "time.filmsShare")
  if (series <= 0 || films <= 0) return null

  return (
    <div className="font-display" style={{ marginTop: u(14) }} data-testid="rewind-number-split">
      <p className="flex justify-between" style={{ fontSize: ut(13), fontVariationSettings: axes(100, 600) }}>
        <span>{label(facts, "Series", "time.seriesHours", "time.seriesShare")}</span>
        <span>{label(facts, "Films", "time.filmsHours", "time.filmsShare")}</span>
      </p>
      <div aria-hidden className="rw-grow flex" style={{ height: u(24), gap: u(4), marginTop: u(5) }}>
        <span className="bg-current" style={{ flexGrow: series }} />
        <span className="rw-hatch border-[1.5px] border-current" style={{ flexGrow: films }} />
      </div>
    </div>
  )
}
