/**
 * Renders a share card to PNG through `next/og` with the card fonts
 * (design 6.4). The same input always gives the same bytes for a type-only
 * card, which is what lets owner and link renders share one cache file.
 *
 * @module lib/rewind/cards/render
 */

import "server-only"

import { ImageResponse } from "next/og"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { CARD_SIZES } from "./frame"
import { loadCardFonts } from "./fonts"
import { hasCard, renderCard } from "./index"

/** The card's PNG, or null when its page has no card yet. */
export async function renderCardPng(input: CardInput): Promise<Buffer | null> {
  if (!hasCard(input.page.type)) return null
  // Imported only for art, so a type-only render never loads the database client.
  const assets = input.art?.length ? await (await import("./art")).loadCardArt(input.art) : undefined
  const element = renderCard(input, assets)
  if (!element) return null
  const fonts = await loadCardFonts()
  const response = new ImageResponse(element, { ...CARD_SIZES[input.size], fonts })
  return Buffer.from(await response.arrayBuffer())
}
