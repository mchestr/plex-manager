/**
 * The pieces several cards share (design 6.4): the card headline, the
 * soundtrack strip, the evidence clock as an SVG data URI, the poster's
 * stats row and a poster slot. Each reads the projected page only.
 *
 * @module lib/rewind/cards/parts
 */

import type { ReactElement } from "react"

import { CARD_SLACK } from "@/lib/rewind/typeset/fit-lines"
import { hourRing } from "@/lib/rewind/viz/hour-ring"
import { binsPath } from "@/lib/rewind/viz/soundtrack"
import type { CardInput } from "@/lib/wrapped/data/share-safe"
import type { CardFactId } from "@/lib/wrapped/data/share-safe-schema"

import type { CardInk } from "./frame"
import { fitCard, fitNameplate, Graphic, Line, lineFamily, Nameplate, Picture, Text } from "./type"

export const LABEL = { wdth: 100, weight: 600 } as const

/** What a card draws besides its input: the poster art, already fetched, null where a poster is missing. */
export interface CardAssets {
  art: ReadonlyArray<string | null>
}

export const NO_ASSETS: CardAssets = { art: [] }

/** The page's card headline as a nameplate; a line the card fonts cannot set prints in Noto (safe mode). */
export function CardHeadline({ input, measure, sizeMax, maxLines }: { input: CardInput; measure: number; sizeMax: number; maxLines: number }): ReactElement {
  return <Nameplate fit={fitNameplate(input.page.headline, measure, sizeMax, maxLines)} />
}

/** A title (or a name) in Archivo 700 at W87.5, in up to `maxLines` fitted lines, or in Noto in safe mode. */
export function CardTitle({ text, measure, sizeMin, sizeMax, maxLines = 2 }: { text: string; measure: number; sizeMin: number; sizeMax: number; maxLines?: number }): ReactElement {
  const fit = fitCard(text, { role: "sentence", weight: 700, widths: [87.5], measure: measure / (1 + CARD_SLACK), maxLines, sizeMin, sizeMax })
  return (
    <div style={{ display: "flex", flexDirection: "column", width: measure }}>
      {fit.lines.map((line, i) => (
        <div key={`${i}:${line.text}`} style={{ display: "flex", fontFamily: lineFamily(fit, line, 700), fontSize: fit.size, whiteSpace: "nowrap", lineHeight: `${Math.round(fit.size * (fit.safeMode ? 1.2 : 1.05))}px` }}>
          {line.text}
        </div>
      ))}
    </div>
  )
}

/** A bar `width` x `height` hatched with 45-degree lines in `ink`, as an SVG with no text. */
function hatchSvg(width: number, height: number, ink: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="h" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="12" fill="${ink}"/></pattern></defs>` +
    `<rect x="1.5" y="1.5" width="${Math.max(0, width - 3)}" height="${Math.max(0, height - 3)}" fill="url(#h)" stroke="${ink}" stroke-width="3"/></svg>`
  )
}

/** A horizontal bar: solid in the ink, or hatched. */
export function Bar({ width, height, ink, solid }: { width: number; height: number; ink: string; solid: boolean }): ReactElement {
  return solid ? <div style={{ display: "flex", width, height, backgroundColor: ink }} /> : <Graphic svg={hatchSvg(width, height, ink)} width={width} height={height} />
}

/** A stat: a fitted numeral over its label. */
export function Stat({ value, label, width, size = 96 }: { value: string; label: string; width: number; size?: number }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <Line text={value} face={{ wdth: 75, weight: 900, size, measure: width }} style={{ lineHeight: `${size}px` }} />
      <Text text={label} family="textItalic" size={36} width={width} style={{ marginTop: 8 }} />
    </div>
  )
}

/** The count a display prints: "1,240" is 1240, "Top 3%" is 3. */
export const countOf = (display: string | undefined) => Number((display ?? "").replace(/[^\d.]/g, "")) || 0

function soundtrackSvg(bins: number[], daily: boolean, width: number, height: number, ink: string): string {
  const scaled = daily ? bins.map(Math.sqrt) : bins
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${binsPath(scaled, width, height)}" fill="${ink}"/></svg>`
}

/** The year's soundtrack with its grain and window, or nothing when the page publishes none. */
export function SoundtrackStrip({ input, ink, width, height }: { input: CardInput; ink: CardInk; width: number; height: number }): ReactElement | null {
  const { soundtrack } = input.page
  if (!soundtrack) return null
  const daily = soundtrack.grain === "daily"
  const through = input.page.facts["window.through"]?.display
  const windowLine = through ? `Data through ${through}` : ""
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <Graphic svg={soundtrackSvg(soundtrack.bins, daily, width, height, ink.on)} width={width} height={height} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
        <Line text={daily ? `One line per day of ${input.year}` : `One bar per week of ${input.year}`} face={{ ...LABEL, size: 27, measure: 560 }} />
        {windowLine ? <Line text={windowLine} face={{ ...LABEL, size: 27, measure: 360 }} /> : null}
      </div>
    </div>
  )
}

/** The evidence clock's bars and arc (design 5.3) as an SVG with no text: the bars in the ink, the window in the spot. */
export function ringSvg(hours: readonly number[], { size, arc, peak, ink }: { size: number; arc: { from: number; to: number } | null; peak: number | null; ink: CardInk }): string {
  const ring = hourRing(hours, { size, arc: arc ?? { from: 0, to: -1 }, peak, gutter: 0 })
  const bars = ring.bars
    .map((bar) => {
      const fill = arc && bar.inArc ? ink.spot : ink.on
      return `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${(1.5 * size) / 256}" transform="rotate(${bar.angle} ${ring.centre} ${ring.centre})" fill="${fill}"/>`
    })
    .join("")
  const arcPath = arc ? `<path d="${ring.arc.d}" fill="none" stroke="${ink.spot}" stroke-width="${(3.5 * size) / 256}" stroke-linecap="round"/>` : ""
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bars}${arcPath}</svg>`
}

/** What each poster stat reads under its value. */
const STAT_LABEL: Record<CardFactId, string> = {
  "time.totalHours": "hours this year",
  "time.seriesHours": "hours of series",
  "counts.films": "films",
  "counts.episodes": "episodes",
  "standing.percentile": "on the server",
  "hours.peak": "busiest hour",
  "streak.longest.days": "longest streak",
  "archetype.rarityShare": "of Rewinds here",
  "taste.genre[1].name": "top genre",
  "records.completionShare": "of it finished",
}

/** The poster's stats, divided by 2 px rules under a 3 px rule (`card-centrefold.png`). */
export function StatsRow({ input, ink, width }: { input: CardInput; ink: CardInk; width: number }): ReactElement | null {
  const stats = input.page.stats.flatMap((id) => {
    const value = input.page.facts[id]?.display
    return value ? [{ id, value }] : []
  })
  if (stats.length === 0) return null
  const column = Math.floor(width / stats.length)
  return (
    <div style={{ display: "flex", width, borderTop: `3px solid ${ink.on}`, paddingTop: 26 }}>
      {stats.map(({ id, value }, i) => (
        <div key={id} style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, ...(i > 0 ? { borderLeft: `2px solid ${ink.on}`, paddingLeft: 28 } : {}) }}>
          <Line text={value} face={{ wdth: 75, weight: 900, size: 84, measure: column - 40 }} style={{ lineHeight: "84px" }} />
          <Text text={STAT_LABEL[id]} family="text" size={33} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

/** A poster at its outer size with a border in the ink, or an empty bordered slot when its art is missing. */
export function PosterSlot({ src, width, height, ink, rotate }: { src: string | null; width: number; height: number; ink: CardInk; rotate?: number }): ReactElement {
  const frame = { border: `5px solid ${ink.on}`, borderRadius: 6, ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}) }
  return src ? (
    <Picture src={src} width={width} height={height} style={frame} />
  ) : (
    <div style={{ display: "flex", width, height, backgroundColor: ink.spot, ...frame }} />
  )
}
