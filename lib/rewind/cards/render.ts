/**
 * Renders a share card to PNG through `next/og` with the card fonts
 * (design 6.4). The same input always gives the same bytes for a type-only
 * card, which is what lets owner and link renders share one cache file.
 *
 * Text the card fonts cannot set prints in Noto (P7.6): the render collects
 * the text of every safe-mode element and adds the Noto subsets cut to it.
 *
 * @module lib/rewind/cards/render
 */

import "server-only"

import { ImageResponse } from "next/og"
import { isValidElement, type ReactElement, type ReactNode } from "react"

import type { CardInput } from "@/lib/wrapped/data/share-safe"

import { CARD_SIZES } from "./frame"
import { loadCardFonts } from "./fonts"
import { hasCard, renderCard } from "./index"
import { loadNotoFonts } from "./noto"
import { OgCard } from "./og"

/** The card's element tree: every page has an OG card (P7.5), and a story card once its renderer lands. */
async function cardElement(input: CardInput) {
  if (input.size === "og") return OgCard(input)
  if (!hasCard(input.page.type)) return null
  // Imported only for art, so a type-only render never loads the database client.
  const assets = input.art?.length ? await (await import("./art")).loadCardArt(input.art) : undefined
  return renderCard(input, assets)
}

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(textOf).join("") : ""

/**
 * The text of every safe-mode element in a card's tree, its function
 * components expanded as Satori expands them. @internal Exported for its test.
 */
export function safeModeTexts(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(safeModeTexts)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<{ children?: ReactNode; style?: { fontFamily?: string } }>
  if (typeof element.type === "function") return safeModeTexts((element.type as (props: unknown) => ReactNode)(element.props))
  if (element.props.style?.fontFamily?.startsWith("Rewind Noto")) return [textOf(element.props.children)]
  return safeModeTexts(element.props.children)
}

/** The card's PNG, or null when its page has no card yet. */
export async function renderCardPng(input: CardInput): Promise<Buffer | null> {
  const element = await cardElement(input)
  if (!element) return null
  const [fonts, noto] = await Promise.all([loadCardFonts(), loadNotoFonts(safeModeTexts(element))])
  const response = new ImageResponse(element, { ...CARD_SIZES[input.size], fonts: [...fonts, ...noto] })
  return Buffer.from(await response.arrayBuffer())
}
