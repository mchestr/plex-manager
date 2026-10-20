import { FittedLines } from "@/components/rewind/pages/fitted-lines"
import { axes, u } from "@/components/rewind/pages/units"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"

/** Under this width a card shows the first word only (design 5.8). */
const NARROW = 48
const NARROW_SIZE = 12.5
const PAD = 4

interface TitleCardProps {
  title: string
  /** The box in logical artboard px. */
  width: number
  height: number
  year?: string
}

/** The first word, when it fits the narrow card at 12.5 px; else nothing (a plain halftone card). */
function firstWord(title: string, width: number): string | null {
  const word = title.split(/\s+/)[0] ?? ""
  const fit = fitLines(word, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: width - PAD * 2, maxLines: 1, sizeMin: NARROW_SIZE, sizeMax: NARROW_SIZE, widths: [62] })
  return word && !fit.ellipsized && !fit.safeMode ? word : null
}

/**
 * The typographic poster (Rewind design 5.8): the title in Archivo width 62
 * over a halftone, the year beneath, printed in the page's spot and field,
 * the field's colour on the spot (both are page tokens, so the card follows
 * the page's ink). It fills the poster's box, so a missing poster never
 * changes the layout. Decorative: the title is always set beside it.
 */
export function TitleCard({ title, width, height, year }: TitleCardProps) {
  const narrow = width < NARROW
  const word = narrow ? firstWord(title, width) : null
  const fit = narrow ? null : fitLines(title, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: width - PAD * 2, maxLines: 4, sizeMin: 9, sizeMax: Math.min(30, width * 0.28), widths: [62] })

  return (
    <span
      aria-hidden
      data-testid="rewind-title-card"
      className="relative flex size-full flex-col justify-between overflow-hidden bg-chart-2 text-background"
      style={{ padding: u(PAD), width: u(width), height: u(height) }}
    >
      <span className="rw-halftone absolute inset-0 bg-background opacity-30" />
      {fit && <FittedLines fit={fit} weight={900} className="relative" />}
      {word && (
        <span className="relative font-display whitespace-nowrap" style={{ fontSize: u(NARROW_SIZE), lineHeight: 0.9, fontVariationSettings: axes(62, 900) }}>
          {word}
        </span>
      )}
      {year && !narrow && (
        <span className="relative font-display tabular-nums" style={{ fontSize: u(11), fontVariationSettings: axes(87.5, 700) }}>
          {year}
        </span>
      )}
    </span>
  )
}
