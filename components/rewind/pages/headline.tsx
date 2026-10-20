import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { cn } from "@/lib/utils"

import { FittedLines } from "./fitted-lines"
import { MEASURE } from "./units"

/**
 * A sentence headline (design 5.4, `slide-05-top-shows.png`): Archivo 850 at
 * width 75, one size for every line, flush left, up to 3 lines, as the
 * page's `h2`.
 */
export function SentenceHeadline({ text, id, className }: { text: string; id?: string; className?: string }) {
  const fit = fitLines(text, { role: "sentence", metrics: pageMetrics, weight: 850, measure: MEASURE, maxLines: 3, sizeMin: 30, sizeMax: 42, widths: [75] })
  return (
    <h2 id={id} tabIndex={-1} className={cn("outline-none", className)}>
      <FittedLines fit={fit} weight={850} lineHeight={0.9} />
    </h2>
  )
}
