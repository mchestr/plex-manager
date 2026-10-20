/**
 * The OG fonts for `next/og`: IBM Plex Sans 400, 500 and 600 and Plex Mono
 * 500, subset by `scripts/build-og-fonts.py` and renamed "OG Sans" and
 * "OG Mono" (the licence reserves "Plex"). Read with `fs.readFile` once per
 * process; nothing is fetched at runtime.
 *
 * A standalone build traces only imported files, so `next.config.js` lists
 * `lib/og/fonts/` in `outputFileTracingIncludes` for the icon and OG routes.
 *
 * @module lib/og/fonts
 */

import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { ImageResponse } from "next/og"

type OgFont = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>[number]

export const OG_SANS = "OG Sans"
export const OG_MONO = "OG Mono"

const FONT_DIR = path.join("lib", "og", "fonts")

const FILES: readonly { file: string; name: string; weight: OgFont["weight"] }[] = [
  { file: "OgSans-400.ttf", name: OG_SANS, weight: 400 },
  { file: "OgSans-500.ttf", name: OG_SANS, weight: 500 },
  { file: "OgSans-600.ttf", name: OG_SANS, weight: 600 },
  { file: "OgMono-500.ttf", name: OG_MONO, weight: 500 },
]

let loaded: Promise<OgFont[]> | null = null

async function read(): Promise<OgFont[]> {
  return Promise.all(
    FILES.map(async ({ file, name, weight }) => {
      const bytes = await readFile(path.join(process.cwd(), FONT_DIR, file))
      return { name, weight, style: "normal" as const, data: new Uint8Array(bytes).buffer }
    }),
  )
}

/** The four OG font entries, read from disk on the first call only. */
export function loadOgFonts(): Promise<OgFont[]> {
  loaded ??= read().catch((error: unknown) => {
    loaded = null
    throw error
  })
  return loaded
}
