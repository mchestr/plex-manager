/**
 * The 1200 x 630 OG card (design 6.7), served as `size=og` by both card
 * routes. The share page's metadata points at the page `ogPage()` picks.
 *
 * - When the centrefold (16) or the back cover (18) is published, the
 *   centrefold layout of `card-og.png`: the archetype's nameplate, the
 *   compact evidence clock and the three stats.
 * - Otherwise a type-only preview of the first published page on that page's
 *   field: the masthead, the page name, the card headline and at most two of
 *   the page's own published titles or facts.
 *
 * It reads the projected page only, so it carries no name unless the link is
 * signed, and the server name only when `brand` is set.
 *
 * @module lib/rewind/cards/og
 */

import type { ReactElement } from "react"

import { registry } from "@/lib/rewind/registry"
import type { FactId } from "@/lib/wrapped/facts/catalogue"
import type { CardInput } from "@/lib/wrapped/data/share-safe"
import type { SharePageType } from "@/lib/wrapped/data/share-safe-schema"

import { CentrefoldCard } from "./centrefold"
import { Frame } from "./frame"
import { CardHeadline, LABEL } from "./parts"
import { Line } from "./type"

const OG_MEASURE = 1080

/** The pages whose OG card is the centrefold layout, in the order it prefers them. */
const POSTER_PAGES: readonly SharePageType[] = ["centrefold", "back-cover"]

/** Facts that frame the issue rather than say something about the page. */
const FRAMING = /^(member|window|tz)\./

/**
 * The page a link's OG card is drawn from: the centrefold or back cover when
 * either is published, else the first published page in registry order.
 *
 * @example
 * ```ts
 * ogPage(["top-shows", "clock"])       // "top-shows"
 * ogPage(["cover", "back-cover"])      // "back-cover"
 * ogPage([])                           // null
 * ```
 */
export function ogPage(pages: readonly SharePageType[]): SharePageType | null {
  return POSTER_PAGES.find((page) => pages.includes(page)) ?? pages[0] ?? null
}

/**
 * The page's own titles first, then its facts, at most two, leaving out what
 * the headline already prints. @internal Exported for its test.
 */
export function ogItems(input: CardInput): string[] {
  const { page } = input
  const facts = (Object.entries(page.facts) as [FactId, { display: string }][])
    .filter(([id]) => !FRAMING.test(id))
    .map(([, fact]) => fact.display)
  return [...new Set([...page.titles, ...facts])].filter((item) => !page.headline.includes(item)).slice(0, 2)
}

function TypeOnly(input: CardInput): ReactElement {
  const items = ogItems(input)
  return (
    <Frame input={input}>
      <Line text={registry[input.page.type].name} face={{ ...LABEL, size: 30, measure: OG_MEASURE }} />
      <div style={{ display: "flex", marginTop: 18 }}>
        <CardHeadline input={input} measure={OG_MEASURE - 40} sizeMax={96} maxLines={2} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 28, width: OG_MEASURE }}>
        {items.map((item, i) => (
          <Line key={`${i}:${item}`} text={item} face={{ wdth: 87.5, weight: 700, size: 44, measure: OG_MEASURE }} style={{ marginTop: i === 0 ? 0 : 8 }} />
        ))}
      </div>
    </Frame>
  )
}

/** The OG card for one projected page (`input.size` is `og`). */
export function OgCard(input: CardInput): ReactElement {
  return POSTER_PAGES.includes(input.page.type) ? CentrefoldCard(input) : TypeOnly(input)
}
