/**
 * The card fonts for `next/og` (design 6.4): P2.13's eleven static TTF
 * instances, read with `fs.readFile` once per process and handed to
 * `ImageResponse` as font entries. Static instances only, because Satori
 * cannot set variable axes; every face is its own family, so a card line
 * picks its face by family name alone.
 *
 * The files are read from `lib/rewind/cards/fonts/` under the working
 * directory. A standalone build traces only imported files, so the card
 * routes (P5.10) must add that folder to `outputFileTracingIncludes`.
 *
 * @example
 * ```ts
 * const fonts = await loadCardFonts()
 * fonts.length                 // 11
 * archivoFamily(62, 900)       // "Rewind Archivo W62 Black"
 * new ImageResponse(<Card />, { width: 1080, height: 1920, fonts })
 * ```
 *
 * @module lib/rewind/cards/fonts
 */

import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { ImageResponse } from "next/og"

type CardFont = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>[number]

const FONT_DIR = path.join("lib", "rewind", "cards", "fonts")

/** Archivo's card widths and weights (design 6.4), as `[wdth, wght]`. */
const ARCHIVO: readonly (readonly [number, 600 | 700 | 900])[] = [
  [62, 700], [62, 900], [75, 900], [87.5, 700], [87.5, 900], [100, 600], [100, 900], [125, 900],
]
const WEIGHT_NAME = { 600: "SemiBold", 700: "Bold", 900: "Black" } as const

/** The family name of the Archivo card instance at `wdth` and `wght`, as the font file names itself. */
export function archivoFamily(wdth: number, wght: number): string {
  const face = ARCHIVO.find(([w, g]) => w === wdth && g === wght)
  if (!face) throw new Error(`No Archivo card instance at width ${wdth} and weight ${wght}`)
  return `Rewind Archivo W${Math.trunc(wdth)} ${WEIGHT_NAME[face[1]]}`
}

/** Newsreader's three card instances, all at weight 400. */
export const NEWSREADER = {
  display: "Rewind Newsreader Display Italic",
  text: "Rewind Newsreader Text",
  textItalic: "Rewind Newsreader Text Italic",
} as const

const FILES: readonly { file: string; name: string; weight: CardFont["weight"]; style: CardFont["style"] }[] = [
  ...ARCHIVO.map(([wdth, wght]) => ({
    file: `RewindArchivo-W${Math.trunc(wdth)}-${wght}.ttf`,
    name: archivoFamily(wdth, wght),
    weight: wght,
    style: "normal" as const,
  })),
  { file: "RewindNewsreader-Italic-72.ttf", name: NEWSREADER.display, weight: 400, style: "italic" },
  { file: "RewindNewsreader-16.ttf", name: NEWSREADER.text, weight: 400, style: "normal" },
  { file: "RewindNewsreader-Italic-16.ttf", name: NEWSREADER.textItalic, weight: 400, style: "italic" },
]

let loaded: Promise<CardFont[]> | null = null

async function read(): Promise<CardFont[]> {
  return Promise.all(
    FILES.map(async ({ file, name, weight, style }) => {
      const bytes = await readFile(path.join(process.cwd(), FONT_DIR, file))
      return { name, weight, style, data: new Uint8Array(bytes).buffer }
    }),
  )
}

/** The eleven card font entries, read from disk on the first call only. */
export function loadCardFonts(): Promise<CardFont[]> {
  loaded ??= read().catch((error: unknown) => {
    loaded = null
    throw error
  })
  return loaded
}
