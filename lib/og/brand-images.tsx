/**
 * The app icons and the default OG card (ui-design-system 7.5), drawn with
 * `next/og` from the committed OG fonts and the dark tokens.
 *
 * ```
 * icon (32, 180, 192, 512)      OG card (1200 x 630)
 * ┌──────────┐                  ┌────────────────────────────────────┐
 * │        ▪ │  pip             │ ┌──────┐                           │
 * │    N     │  monogram        │ │  N ▪ │  monogram tile            │
 * │          │                  │ └──────┘                           │
 * └──────────┘                  │ Northfield Plex     Sans 600       │
 *                               │ plex.example.com    Mono 500       │
 *                               └────────────────────────────────────┘
 * ```
 *
 * Only text the fonts cover is drawn, so `next/og` never fetches a font: the
 * monogram falls back through `monogramFor()`, a name the fonts cannot draw
 * becomes the product name, and an uncovered host is left out.
 *
 * @module lib/og/brand-images
 */

import "server-only"

import { ImageResponse } from "next/og"

import { monogramFor, productName, serverName } from "@/lib/brand"
import { themes } from "@/lib/design/tokens"
import { getEnv } from "@/lib/env"
import { covers } from "@/lib/og/coverage"
import { loadOgFonts, OG_MONO, OG_SANS } from "@/lib/og/fonts"

const dark = themes.dark

/** The monogram tile at `size` px: the letter, or a centred pip when there is none, with the pip in the corner. */
function MonogramTile({ letter, size, radius }: { letter: string | null; size: number; radius: number }) {
  const pip = Math.max(4, Math.round(size * 0.14))
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: radius,
        background: dark.secondary.hex,
        border: `${Math.max(1, Math.round(size / 48))}px solid ${dark["border-strong"].hex}`,
      }}
    >
      {letter ? (
        <div
          style={{
            display: "flex",
            fontFamily: OG_SANS,
            fontWeight: 600,
            fontSize: Math.round(size * 0.58),
            lineHeight: 1,
            color: dark.foreground.hex,
          }}
        >
          {letter}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          position: letter ? "absolute" : "relative",
          top: letter ? Math.round(size * 0.14) : undefined,
          right: letter ? Math.round(size * 0.14) : undefined,
          width: letter ? pip : pip * 2,
          height: letter ? pip : pip * 2,
          borderRadius: Math.max(1, Math.round(pip / 4)),
          background: dark.primary.hex,
        }}
      />
    </div>
  )
}

/**
 * A square app icon at `size` px. `radius` is a fraction of the size; the
 * Apple icon passes 0, because iOS rounds it.
 */
export async function renderIcon(size: number, radius = 0.22): Promise<ImageResponse> {
  const [name, fonts] = await Promise.all([serverName(), loadOgFonts()])
  return new ImageResponse(<MonogramTile letter={monogramFor(name)} size={size} radius={Math.round(size * radius)} />, {
    width: size,
    height: size,
    fonts,
  })
}

export const OG_SIZE = { width: 1200, height: 630 } as const

/** The public host for the card's second line, when one is set and the fonts draw it. */
function publicHost(): string | null {
  const { NEXT_PUBLIC_APP_URL, NEXTAUTH_URL } = getEnv()
  const url = NEXT_PUBLIC_APP_URL ?? NEXTAUTH_URL
  if (!url) return null
  try {
    const { host } = new URL(url)
    return covers(host, "OgMono-500") ? host : null
  } catch {
    return null
  }
}

/** The default OG card: the monogram tile, the server name and the public host. */
export async function renderOgCard(): Promise<ImageResponse> {
  const [name, fonts] = await Promise.all([serverName(), loadOgFonts()])
  const title = covers(name, "OgSans-600") ? name : productName
  const host = publicHost()
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 96,
        background: dark.background.hex,
      }}
    >
      <MonogramTile letter={monogramFor(name)} size={168} radius={24} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "flex",
            fontFamily: OG_SANS,
            fontWeight: 600,
            fontSize: title.length > 22 ? 68 : 88,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            color: dark.foreground.hex,
          }}
        >
          {title}
        </div>
        {host ? (
          <div
            style={{
              display: "flex",
              fontFamily: OG_MONO,
              fontWeight: 500,
              fontSize: 30,
              color: dark["muted-foreground"].hex,
            }}
          >
            {host}
          </div>
        ) : null}
      </div>
    </div>,
    { ...OG_SIZE, fonts },
  )
}
