/**
 * 01 Cover card: the first card (design 6.4). The page's card headline as a
 * nameplate, the year's soundtrack (48 weekly bars unless the member chose
 * daily detail) and the data window. Everything it prints comes from the
 * projected page; a headline the card fonts cannot set prints in Noto.
 *
 * @module lib/rewind/cards/cover
 */

import type { ReactElement } from "react"

import { binsPath } from "@/lib/rewind/viz/soundtrack"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { cardInk, Frame } from "./frame"
import { CARD_MEASURE, fitNameplate, Graphic, Line, Nameplate } from "./type"

const LABEL = { wdth: 100, weight: 600 } as const

function soundtrackSvg(bins: number[], daily: boolean, width: number, height: number, ink: string): string {
  const scaled = daily ? bins.map(Math.sqrt) : bins
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${binsPath(scaled, width, height)}" fill="${ink}"/></svg>`
}

export function CoverCard(input: CardInput): ReactElement {
  const { page } = input
  const ink = cardInk(input)
  const og = input.size === "og"
  const measure = og ? 1080 : CARD_MEASURE
  const headline = fitNameplate(page.headline, measure, og ? 96 : 150, og ? 2 : 4)
  const daily = page.soundtrack?.grain === "daily"
  const through = page.facts["window.through"]?.display
  const windowLine = through ? `Data through ${through}` : ""
  const stripHeight = og ? 120 : 220

  return (
    <Frame input={input}>
      <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 0 : 80 }}>
        <Nameplate fit={headline} />
      </div>
      {page.soundtrack ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: og ? 36 : 120 }}>
          <Graphic svg={soundtrackSvg(page.soundtrack.bins, daily, measure, stripHeight, ink.on)} width={measure} height={stripHeight} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
            <Line text={daily ? `One line per day of ${input.year}` : `One bar per week of ${input.year}`} face={{ ...LABEL, size: 27, measure: 560 }} />
            {windowLine ? <Line text={windowLine} face={{ ...LABEL, size: 27, measure: 360 }} /> : null}
          </div>
        </div>
      ) : null}
    </Frame>
  )
}
