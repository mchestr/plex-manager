/**
 * The card type roles (design 6.4) as Satori-safe elements. Every Archivo
 * line is fitted by `fitLines` with the card metrics to its measure less
 * `CARD_SLACK` and set `whiteSpace: 'nowrap'`, so Satori never re-wraps it.
 * P5.11's cards add the Newsreader roles.
 *
 * @module lib/rewind/cards/type
 */

import type { CSSProperties, ReactElement } from "react"

import { archivoFamily, NEWSREADER } from "@/lib/rewind/cards/fonts"
import { CARD_SLACK, fitLines, type FitResult } from "@/lib/rewind/typeset/fit-lines"
import { cardMetrics } from "@/lib/rewind/typeset/metrics"

/** The story card's measure: 1080 px less two 72 px margins. */
export const CARD_MEASURE = 936

const slack = (measure: number) => measure / (1 + CARD_SLACK)

export interface Face {
  wdth: number
  weight: 600 | 700 | 900
  size: number
  measure: number
}

/** One Archivo line in one face, as large as `face.size` while it fits. */
export function Line({ text, face, style }: { text: string; face: Face; style?: CSSProperties }): ReactElement {
  const fit = fitLines(text, {
    role: "nameplate", metrics: cardMetrics, weight: face.weight, widths: [face.wdth], tracking: 0,
    measure: slack(face.measure), maxLines: 1, sizeMin: 18, sizeMax: face.size,
  })
  const line = fit.lines[0]
  return (
    <div style={{ display: "flex", fontFamily: archivoFamily(line?.wdth ?? face.wdth, face.weight), fontSize: fit.size, whiteSpace: "nowrap", ...style }}>
      {line?.text ?? ""}
    </div>
  )
}

/** A multi-line nameplate or headline in Archivo 900 across the five card widths. */
export function fitNameplate(text: string, measure: number, sizeMax: number, maxLines = 3): FitResult {
  return fitLines(text, {
    role: "nameplate", metrics: cardMetrics, weight: 900, measure: slack(measure), maxLines, sizeMin: 56, sizeMax,
  })
}

/** The lines of a fitted nameplate, flush left. */
export function Nameplate({ fit, lineHeight = 0.9 }: { fit: FitResult; lineHeight?: number }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {fit.lines.map((line, i) => (
        <div
          key={`${i}:${line.text}`}
          style={{
            display: "flex", fontFamily: archivoFamily(line.wdth, 900), fontSize: fit.size,
            lineHeight: `${Math.round(fit.size * lineHeight)}px`, whiteSpace: "nowrap",
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  )
}

/**
 * Newsreader text. Newsreader has no built metrics, so a `width` lets Satori
 * break a longer line (a poster line, a caption); without one it is one line.
 */
export function Text({
  text, family, size, lineHeight = 1.25, width, style,
}: { text: string; family: keyof typeof NEWSREADER; size: number; lineHeight?: number; width?: number; style?: CSSProperties }): ReactElement {
  return (
    <div
      style={{
        display: "flex", fontFamily: NEWSREADER[family], fontStyle: family === "text" ? "normal" : "italic", fontSize: size,
        lineHeight: `${Math.round(size * lineHeight)}px`, ...(width ? { width } : { whiteSpace: "nowrap" }), ...style,
      }}
    >
      {text}
    </div>
  )
}

/** A raster image (a poster) or a data URI, at its outer size. */
export function Picture({ src, width, height, style }: { src: string; width: number; height: number; style?: CSSProperties }): ReactElement {
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
  return <img src={src} width={width} height={height} alt="" style={{ display: "flex", ...style }} />
}

/** A graphic: an SVG data URI with no `<text>` inside. */
export function Graphic({ svg, width, height, style }: { svg: string; width: number; height: number; style?: CSSProperties }): ReactElement {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
  return <img src={src} width={width} height={height} alt="" style={{ display: "flex", ...style }} />
}
