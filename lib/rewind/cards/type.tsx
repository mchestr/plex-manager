/**
 * The card type roles (design 6.4) as Satori-safe elements. Every Archivo
 * line is fitted by `fitLines` with the card metrics to its measure less
 * `CARD_SLACK` and set `whiteSpace: 'nowrap'`, so Satori never re-wraps it.
 * P5.11's cards add the Newsreader roles.
 *
 * Text the card fonts cannot set (safe mode, design 4.9) prints in the Noto
 * faces of its scripts (`notoStack`) at a fixed size, its word breaks chosen
 * here before rendering from an estimate of the Noto advances (P7.6).
 *
 * @module lib/rewind/cards/type
 */

import type { CSSProperties, ReactElement } from "react"

import { archivoFamily, NEWSREADER } from "@/lib/rewind/cards/fonts"
import { CARD_SLACK, fitLines, type FitOptions, type FitResult } from "@/lib/rewind/typeset/fit-lines"
import { cardMetrics } from "@/lib/rewind/typeset/metrics"

import { notoStack } from "./noto"

/** The story card's measure: 1080 px less two 72 px margins. */
export const CARD_MEASURE = 936

const slack = (measure: number) => measure / (1 + CARD_SLACK)

export interface Face {
  wdth: number
  weight: 600 | 700 | 900
  size: number
  measure: number
}

const WIDE = /[\u2e80-\u9fff\uac00-\ud7ff\uf900-\uffef]/u

/** Noto's rough advance in em: CJK and Hangul are square, the rest about 0.6. */
function estimateEm(text: string): number {
  return Array.from(text).reduce((sum, ch) => sum + (ch === " " ? 0.26 : WIDE.test(ch) || (ch.codePointAt(0) ?? 0) >= 0x20000 ? 1 : 0.6), 0)
}

/** Break units: words, and each CJK character, which may break anywhere. */
function units(text: string): Array<{ text: string; space: boolean }> {
  return text
    .split(" ")
    .flatMap((word, w) => (WIDE.test(word) ? Array.from(word) : [word]).map((part, i) => ({ text: part, space: w > 0 && i === 0 })))
}

/**
 * A safe-mode text set at a fixed `size` in up to `maxLines` balanced
 * lines: as few lines as the estimate needs, each ending at the break
 * closest to an even share of the text. @internal Exported for its test.
 */
export function safeFit(text: string, { measure, maxLines, size }: { measure: number; maxLines: number; size: number }): FitResult {
  const parts = units(text)
  const join = (from: number, to: number) => parts.slice(from, to).map((p, i) => (i > 0 && p.space ? ` ${p.text}` : p.text)).join("")
  const total = estimateEm(text)
  const count = Math.max(1, Math.min(maxLines, parts.length, Math.ceil((total * size) / measure)))
  const lines: string[] = []
  let start = 0
  for (let line = 1; line < count; line++) {
    const target = (total * line) / count
    let end = start + 1
    const off = (to: number) => Math.abs(estimateEm(join(0, to)) - target)
    while (end < parts.length - (count - line) && off(end + 1) < off(end)) end++
    lines.push(join(start, end))
    start = end
  }
  lines.push(join(start, parts.length))
  return { size, lines: lines.map((line) => ({ text: visualOrder(line), wdth: 100, width: 0 })), ellipsized: false, ariaLabel: text, safeMode: true }
}

const RTL = /[\p{Script=Hebrew}\p{Script=Arabic}]/u
const STRONG_LTR = /[0-9\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u

/**
 * Satori lays every line out left to right, so a line written wholly right
 * to left (Hebrew, Arabic) is reversed into visual order, a grapheme at a
 * time so marks stay on their letters. Mixed lines, and lines with digits,
 * are left as they are.
 */
function visualOrder(line: string): string {
  if (!RTL.test(line) || STRONG_LTR.test(line)) return line
  return Array.from(new Intl.Segmenter().segment(line), (s) => s.segment).reverse().join("")
}

/** `fitLines` with the card metrics, or a safe-mode fit at `sizeMin` when the card fonts cannot set the text. */
export function fitCard(text: string, opts: Omit<FitOptions, "metrics">): FitResult {
  const fit = fitLines(text, { ...opts, metrics: cardMetrics })
  return fit.safeMode ? safeFit(fit.ariaLabel, { measure: opts.measure, maxLines: opts.maxLines, size: opts.sizeMin }) : fit
}

/** The family a fitted line prints in: its Archivo instance, or its Noto faces in safe mode. */
export function lineFamily(fit: FitResult, line: FitResult["lines"][number], weight: Face["weight"]): string {
  return fit.safeMode ? notoStack(line.text) : archivoFamily(line.wdth, weight)
}

/**
 * One Archivo line in one face, as large as `face.size` while it fits. In
 * safe mode, one Noto line at the size the estimate fits to the measure.
 */
export function Line({ text, face, style }: { text: string; face: Face; style?: CSSProperties }): ReactElement {
  const measure = slack(face.measure)
  const fitted = fitLines(text, {
    role: "nameplate", metrics: cardMetrics, weight: face.weight, widths: [face.wdth], tracking: 0,
    measure, maxLines: 1, sizeMin: 18, sizeMax: face.size,
  })
  const fit = fitted.safeMode
    ? safeFit(fitted.ariaLabel, { measure, maxLines: 1, size: Math.max(18, Math.min(face.size, Math.floor(measure / Math.max(1, estimateEm(fitted.ariaLabel))))) })
    : fitted
  const line = fit.lines[0]
  return (
    <div style={{ display: "flex", fontFamily: line ? lineFamily(fit, line, face.weight) : archivoFamily(face.wdth, face.weight), fontSize: fit.size, whiteSpace: "nowrap", ...style }}>
      {line?.text ?? ""}
    </div>
  )
}

/** A multi-line nameplate or headline in Archivo 900 across the five card widths. */
export function fitNameplate(text: string, measure: number, sizeMax: number, maxLines = 3): FitResult {
  return fitCard(text, { role: "nameplate", weight: 900, measure: slack(measure), maxLines, sizeMin: Math.min(56, sizeMax), sizeMax })
}

/** The lines of a fitted nameplate, flush left. */
export function Nameplate({ fit, lineHeight = 0.9 }: { fit: FitResult; lineHeight?: number }): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {fit.lines.map((line, i) => (
        <div
          key={`${i}:${line.text}`}
          style={{
            display: "flex", fontFamily: lineFamily(fit, line, 900), fontSize: fit.size,
            lineHeight: `${Math.round(fit.size * (fit.safeMode ? Math.max(lineHeight, 1.15) : lineHeight))}px`, whiteSpace: "nowrap",
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
