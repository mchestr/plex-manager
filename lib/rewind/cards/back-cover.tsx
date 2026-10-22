/**
 * 18 Back cover card (`card-back-cover.png`): the published posters fanned
 * when the member includes art, the billing block set like a film poster's
 * credits, and the soundtrack. Printed on paper in the archetype's deep ink.
 *
 * The billing block reads only the projected page: its displays, its titles
 * by title fact, the brand (when the admin shows it) and the owner's first
 * name only when the card is signed, so an unsigned card never names the
 * member. Its lines are set by `billingBlock` on the page's 358 px measure
 * and scaled to the card's, so a card keeps the page's proportions.
 *
 * @module lib/rewind/cards/back-cover
 */

import type { ReactElement } from "react"

import { billingBlock, CONNECTOR_SCALE } from "@/lib/rewind/billing-block"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { archivoFamily, NEWSREADER } from "./fonts"
import { cardInk, Frame } from "./frame"
import { NO_ASSETS, PosterSlot, SoundtrackStrip, type CardAssets } from "./parts"
import { CARD_MEASURE } from "./type"

/** The back cover page's measure, which the billing sizes are set on. */
const PAGE_MEASURE = 358
const SCALE = CARD_MEASURE / PAGE_MEASURE

const FAN = [
  { left: 75, top: 26, rotate: -8 },
  { left: 293, top: 0, rotate: -3 },
  { left: 513, top: 0, rotate: 2 },
  { left: 731, top: 26, rotate: 7 },
]

/**
 * The projected page as the facts `billingBlock` reads: each display, with
 * the number it shows as its value, the titles under their title facts, and
 * the first name only when the card is signed.
 */
function billingFacts(input: CardInput): RewindFactsV3 {
  const facts: RewindFactsV3 = {}
  for (const [id, fact] of Object.entries(input.page.facts) as [FactId, { display: string }][]) {
    const digits = fact.display.replace(/[^\d.]/g, "")
    facts[id] = { value: digits ? Number(digits) : null, display: fact.display, unit: "text" }
  }
  input.page.titleIds.forEach((id, i) => {
    facts[id] = { value: null, display: input.page.titles[i], unit: "title" }
  })
  if (input.signed && input.ownerName) facts["member.firstName"] = { value: null, display: input.ownerName, unit: "name" }
  return facts
}

export function BackCoverCard(input: CardInput, assets: CardAssets = NO_ASSETS): ReactElement {
  const ink = cardInk(input)
  const og = input.size === "og"
  const { lines } = billingBlock(billingFacts(input), {
    serverName: input.brand ?? "",
    named: input.signed,
    showtime: Boolean(input.page.facts["hours.peak"]),
    locale: "en-US",
    // Edit card (P8.4): the member's chosen stats become the tail line.
    tail: input.cardFacts.length > 0 ? input.page.stats : undefined,
    measure: PAGE_MEASURE,
    metrics: pageMetrics,
  })
  const scale = og ? SCALE * 0.55 : SCALE
  const art = og ? [] : (input.page.art ?? [])

  return (
    <Frame input={input}>
      {art.length > 0 ? (
        <div style={{ display: "flex", position: "relative", width: 1080, height: 470, marginLeft: -72 }}>
          {art.map((poster, i) => (
            <div key={poster.ratingKey} style={{ display: "flex", position: "absolute", left: FAN[i].left, top: FAN[i].top }}>
              <PosterSlot src={assets.art[i] ?? null} width={270} height={405} ink={ink} rotate={FAN[i].rotate} />
            </div>
          ))}
        </div>
      ) : null}
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", width: og ? 1080 : CARD_MEASURE, marginTop: art.length > 0 ? 40 : og ? 0 : 160,
          borderTop: `3px solid ${ink.on}`, borderBottom: `3px solid ${ink.on}`, paddingTop: og ? 12 : 26, paddingBottom: og ? 8 : 22,
        }}
      >
        {lines.map((line, i) => {
          const size = Math.round(line.size * scale * 10) / 10
          return (
            <div key={i} style={{ display: "flex", width: "100%", alignItems: "baseline", justifyContent: line.parts.length > 1 ? "space-between" : "center", marginBottom: 6 }}>
              {line.parts.map((part, p) =>
                part.kind === "caps" ? (
                  <div key={p} style={{ display: "flex", fontFamily: archivoFamily(62, 700), fontSize: size, lineHeight: `${Math.round(size * 1.02)}px`, whiteSpace: "nowrap" }}>
                    {part.text}
                  </div>
                ) : (
                  <div key={p} style={{ display: "flex", fontFamily: NEWSREADER.textItalic, fontStyle: "italic", fontSize: Math.round(size * CONNECTOR_SCALE), whiteSpace: "nowrap" }}>
                    {part.text}
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
      {og ? null : <div style={{ display: "flex", flexGrow: 1 }} />}
      {og ? null : <SoundtrackStrip input={input} ink={ink} width={CARD_MEASURE} height={110} />}
    </Frame>
  )
}
