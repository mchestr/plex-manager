/**
 * 05 Top shows card (design 6.4 "top five shows"): the card headline, the
 * published posters when the member includes art, and the list, each title
 * with its minutes. A title the member hid is not in the projection, so its
 * row is simply not drawn.
 *
 * @module lib/rewind/cards/top-shows
 */

import type { ReactElement } from "react"

import { CARD_SLACK, fitLines } from "@/lib/rewind/typeset/fit-lines"
import { cardMetrics } from "@/lib/rewind/typeset/metrics"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { archivoFamily } from "./fonts"
import { cardInk, Frame } from "./frame"
import { CardHeadline, LABEL, NO_ASSETS, PosterSlot, type CardAssets } from "./parts"
import { CARD_MEASURE, Line } from "./type"

const NUMBER_WIDTH = 90

/** `series[3].title` to `series[3].minutes`. */
const minutesOf = (id: FactId) => id.replace(/\.title$/, ".minutes") as FactId

function Row({ rank, title, minutes, measure, ink, first }: { rank: number; title: string; minutes: string; measure: number; ink: string; first: boolean }): ReactElement {
  const width = measure - NUMBER_WIDTH
  const fit = fitLines(title, {
    role: "sentence", metrics: cardMetrics, weight: 700, widths: [87.5], measure: width / (1 + CARD_SLACK), maxLines: 2, sizeMin: 40, sizeMax: first ? 64 : 53,
  })
  return (
    <div style={{ display: "flex", borderTop: `2px solid ${ink}`, paddingTop: 18, paddingBottom: 18 }}>
      <Line text={String(rank)} face={{ wdth: 75, weight: 900, size: 53, measure: NUMBER_WIDTH }} style={{ width: NUMBER_WIDTH }} />
      <div style={{ display: "flex", flexDirection: "column", width }}>
        {fit.lines.map((line, i) => (
          <div key={`${i}:${line.text}`} style={{ display: "flex", fontFamily: archivoFamily(line.wdth, 700), fontSize: fit.size, whiteSpace: "nowrap", lineHeight: `${Math.round(fit.size * 1.05)}px` }}>
            {line.text}
          </div>
        ))}
        {minutes ? <Line text={minutes} face={{ ...LABEL, size: 30, measure: width }} style={{ marginTop: 6 }} /> : null}
      </div>
    </div>
  )
}

export function TopShowsCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const measure = og ? 1080 : CARD_MEASURE
  const { page } = input
  const rows = page.titleIds.map((id, i) => ({ id, title: page.titles[i], minutes: page.facts[minutesOf(id)]?.display ?? "" }))
  const art = page.art ?? []
  const shown = og ? rows.slice(0, 2) : rows

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 40 }}>
        <CardHeadline input={input} measure={measure} sizeMax={og ? 60 : 96} maxLines={og ? 1 : 2} />
      </div>
      {!og && art.length > 0 ? (
        <div style={{ display: "flex", marginTop: 48, marginBottom: 12 }}>
          {art.map((poster, i) => (
            <div key={poster.ratingKey} style={{ display: "flex", marginLeft: i === 0 ? 0 : 24 }}>
              <PosterSlot src={assets.art[i] ?? null} width={216} height={324} ink={ink} />
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 20 : 48, width: measure }}>
        {shown.map((row, i) => (
          <Row key={row.id} rank={Number(/\[(\d)\]/.exec(row.id)?.[1] ?? i + 1)} title={row.title} minutes={row.minutes} measure={measure} ink={ink.on} first={i === 0} />
        ))}
      </div>
    </Frame>
  )
}
