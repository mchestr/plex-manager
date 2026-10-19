/**
 * The three mockup cards of design 15 (`design/mockups/rewind/card-*.html`),
 * ported to JSX for `next/og`, and the card roles the 200 fitting fixtures
 * are set in. P2.14 measures both on the installed Next; P5.10's real cards
 * replace these.
 *
 * Satori rules (design 6.4): `display: flex` on every element with children,
 * no grid, CSS variables, `calc()`, shadows or filters; graphics are SVG data
 * URIs with no `<text>`. Every Archivo line is fitted by `fitLines` from the
 * card metrics to its measure divided by `1 + CARD_SLACK`, and every line is
 * set `white-space: nowrap`, so Satori never re-wraps one. Newsreader has no
 * built metrics, so its lines keep the mockups' sizes and breaks. Satori 0.29
 * ignores `tnum`, so no card line is fitted with tabular figures.
 *
 * @module lib/rewind/cards/__fixtures__/mockup-cards
 */

import type { CSSProperties, ReactElement } from "react"

import { archivoFamily, NEWSREADER } from "@/lib/rewind/cards/fonts"
import { CARD_SLACK, fitLines, type FitOptions, type FitResult } from "@/lib/rewind/typeset/fit-lines"
import { cardMetrics } from "@/lib/rewind/typeset/metrics"

import * as art from "./mockup-art"

/**
 * The card measure: 1080 px less two 72 px margins.
 * @internal
 */
export const CARD_MEASURE = 936

const PAPER = "#f1eadc"
const ULTRAMARINE = "#2238b8"
const MARIGOLD = "#feb644"

/** The width a card line is fitted to, so it still fits after Satori's overflow. */
const slackMeasure = (measure: number) => measure / (1 + CARD_SLACK)

interface TitleRole {
  opts: FitOptions
  /** The text the role sets for a title: billing caps are upper case. */
  text: (title: string) => string
}

const asIs = (title: string) => title

/**
 * The card roles a title is set in (design 6.4), for the 200-title fixture.
 * Sizes are the page roles' times 1080/390; the billing caps take the
 * back-cover mockup's 80 px row size as their largest.
 */
export const CARD_TITLE_ROLES: Record<"No. 1 title" | "list title" | "billing caps", TitleRole> = {
  "No. 1 title": {
    opts: { role: "nameplate", metrics: cardMetrics, weight: 900, measure: slackMeasure(CARD_MEASURE), maxLines: 3, sizeMin: 94, sizeMax: 144 },
    text: asIs,
  },
  "list title": {
    opts: { role: "sentence", metrics: cardMetrics, weight: 700, widths: [87.5], measure: slackMeasure(CARD_MEASURE), maxLines: 3, sizeMin: 50, sizeMax: 53 },
    text: asIs,
  },
  "billing caps": {
    opts: { role: "sentence", metrics: cardMetrics, weight: 700, widths: [62], measure: slackMeasure(CARD_MEASURE), maxLines: 2, sizeMin: 40, sizeMax: 80 },
    text: (title) => title.toUpperCase(),
  },
}

/** The CSS that draws one fitted line with the face it was measured in. */
export function lineStyle(fit: FitResult, index: number, weight: number, tracking = -0.01): CSSProperties {
  return {
    display: "flex",
    fontFamily: archivoFamily(fit.lines[index].wdth, weight),
    fontSize: fit.size,
    letterSpacing: tracking * fit.size,
    whiteSpace: "nowrap",
  }
}

interface Fixed {
  wdth: number
  weight: number
  /** The mockup's size, which is also the largest the line may take. */
  size: number
  measure: number
}

/** One Archivo line in one face, as large as `size` while it fits. */
function Line({ text, face, lineHeight, style }: { text: string; face: Fixed; lineHeight?: number; style?: CSSProperties }) {
  const fit = fitLines(text, {
    role: "nameplate", metrics: cardMetrics, weight: face.weight, widths: [face.wdth], tracking: 0,
    measure: slackMeasure(face.measure), maxLines: 1, sizeMin: 22, sizeMax: face.size,
  })
  const height = lineHeight ? { lineHeight: `${Math.ceil(fit.size * lineHeight)}px` } : {}
  return <div style={{ ...lineStyle(fit, 0, face.weight, 0), ...height, ...style }}>{fit.lines[0].text}</div>
}

/** Newsreader: the mockup's size and break, never re-wrapped. */
function Text({ text, family, size, style }: { text: string; family: keyof typeof NEWSREADER; size: number; style?: CSSProperties }) {
  const italic = family !== "text"
  return (
    <div style={{ display: "flex", fontFamily: NEWSREADER[family], fontStyle: italic ? "italic" : "normal", fontSize: size, whiteSpace: "nowrap", ...style }}>
      {text}
    </div>
  )
}

/** The archetype name as a card nameplate in the five Archivo 900 steps. */
function Nameplate({ text, measure, sizeMax, lineHeight }: { text: string; measure: number; sizeMax: number; lineHeight: number }) {
  const fit = fitLines(text, {
    role: "nameplate", metrics: cardMetrics, weight: 900, measure: slackMeasure(measure), maxLines: 2, sizeMin: 60, sizeMax,
  })
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {fit.lines.map((line, i) => (
        <div key={line.text} style={{ ...lineStyle(fit, i, 900), lineHeight: `${Math.round(fit.size * lineHeight)}px` }}>
          {line.text}
        </div>
      ))}
    </div>
  )
}

function Img({ src, width, height, style }: { src: string; width: number; height: number; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element -- Satori draws <img>, not next/image
  return <img src={src} width={width} height={height} alt="" style={{ display: "flex", ...style }} />
}

const LABEL = { wdth: 100, weight: 600 } as const

function Masthead({ ink }: { ink: string }) {
  return (
    <div style={{ display: "flex", position: "absolute", left: 72, top: 150, width: CARD_MEASURE, flexDirection: "column", color: ink }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Line text="Chester Family Plex" face={{ ...LABEL, size: 34, measure: 600 }} />
        <Line text="Rewind 2026" face={{ wdth: 125, weight: 900, size: 34, measure: 300 }} />
      </div>
      <div style={{ display: "flex", height: 3, backgroundColor: ink, marginTop: 18 }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        <Line text="Vol. 4" face={{ ...LABEL, size: 27, measure: 300 }} />
        <Line text="No. K7Q4" face={{ ...LABEL, size: 27, measure: 300 }} />
      </div>
    </div>
  )
}

function Soundtrack({ src, ink, top }: { src: string; ink: string; top: number }) {
  return (
    <div style={{ display: "flex", position: "absolute", left: 72, top, width: CARD_MEASURE, flexDirection: "column" }}>
      <Img src={src} width={CARD_MEASURE} height={110} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, color: ink }}>
        <Line text="One bar per week of 2026" face={{ ...LABEL, size: 27, measure: 600 }} />
        <Line text={"Data through 30 Nov"} face={{ ...LABEL, size: 27, measure: 300 }} />
      </div>
    </div>
  )
}

const STATS = [
  ["1,307", "hours this year"],
  ["Top 3%", "on the server"],
  ["23 days", "longest streak"],
] as const

/** The primary share poster (`card-centrefold.html`), 1080 x 1920, type and graphics only. */
function CentrefoldCard(): ReactElement {
  return (
    <div style={{ display: "flex", position: "relative", width: 1080, height: 1920, backgroundColor: ULTRAMARINE, color: PAPER }}>
      <Masthead ink={PAPER} />
      <div style={{ display: "flex", position: "absolute", left: 72, top: 296, width: CARD_MEASURE, flexDirection: "column" }}>
        <Text text={"I’m the"} family="display" size={108} style={{ lineHeight: "108px" }} />
        <div style={{ display: "flex", marginTop: 10 }}>
          <Nameplate text="Midnight Marathoner" measure={CARD_MEASURE} sizeMax={240} lineHeight={0.84} />
        </div>
        <Text text="One more episode was the whole plan." family="text" size={50} style={{ lineHeight: "62px", marginTop: 26 }} />
      </div>
      <Img src={art.CENTREFOLD_CLOCK} width={520} height={520} style={{ position: "absolute", left: 280, top: 900 }} />
      <div style={{ display: "flex", position: "absolute", left: 280, top: 900, width: 520, height: 520, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Line text="34%" face={{ wdth: 75, weight: 900, size: 100, measure: 300 }} style={{ lineHeight: "92px" }} />
        <Text text="started" family="textItalic" size={29} style={{ lineHeight: "34px", marginTop: 8 }} />
        <Text text={"10 PM to 4 AM"} family="textItalic" size={29} style={{ lineHeight: "34px" }} />
      </div>
      <div style={{ display: "flex", position: "absolute", left: 72, top: 948.7, width: 208, height: 3.5, backgroundColor: PAPER }} />
      <div style={{ display: "flex", position: "absolute", left: 72, top: 964, flexDirection: "column" }}>
        <Line text={"10 PM"} face={{ wdth: 87.5, weight: 900, size: 46, measure: 208 }} style={{ lineHeight: "50px" }} />
        <Text text="busiest hour" family="textItalic" size={32} style={{ lineHeight: "38px" }} />
      </div>
      <div style={{ display: "flex", position: "absolute", right: 72, top: 1328, flexDirection: "column", alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", width: 52, height: 9, borderRadius: 5, backgroundColor: MARIGOLD, marginRight: 14 }} />
          <Text text="after dark" family="textItalic" size={31} />
        </div>
        <Text text="Times in America/Chicago" family="text" size={29} style={{ lineHeight: "36px", marginTop: 10 }} />
      </div>
      <div style={{ display: "flex", position: "absolute", left: 72, top: 1452, width: CARD_MEASURE, borderTop: `3px solid ${PAPER}`, paddingTop: 26 }}>
        {STATS.map(([value, label], i) => (
          <div
            key={label}
            style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, ...(i > 0 ? { borderLeft: `2px solid ${PAPER}`, paddingLeft: 28 } : {}) }}
          >
            <Line text={value} face={{ wdth: 75, weight: 900, size: 84, measure: 282 }} style={{ lineHeight: "84px" }} />
            <Text text={label} family="text" size={33} style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
      <Soundtrack src={art.CENTREFOLD_BARS} ink={PAPER} top={1660} />
    </div>
  )
}

type Billing = readonly (readonly ["caps" | "italic", string])[]

/** The billing block: caps in Archivo 700 W62 and connectors in Newsreader Text Italic, at the mockup's sizes. */
const BILLING: readonly { caps: number; italic: number; gap: number; parts: Billing }[] = [
  { caps: 80, italic: 49.6, gap: 19, parts: [["caps", "CHESTER FAMILY PLEX"], ["italic", "presents"]] },
  { caps: 80, italic: 49.6, gap: 19, parts: [["caps", "1,307 HOURS"], ["italic", "of"], ["caps", "586 EPISODES"]] },
  { caps: 80, italic: 49.6, gap: 19, parts: [["italic", "and"], ["caps", "112 FILMS"], ["italic", "featuring"]] },
  { caps: 80, italic: 0, gap: 0, parts: [["caps", "THE LORD OF THE RINGS: THE RINGS OF POWER"]] },
  { caps: 56.67, italic: 36, gap: 14, parts: [["italic", "with"], ["caps", "SEVERANCE, SHOGUN"], ["italic", "and"], ["caps", "DUNE: PART TWO"]] },
  {
    caps: 58.24, italic: 36.11, gap: 14,
    parts: [["italic", "showtime"], ["caps", "10 PM"], ["italic", "longest run"], ["caps", "23 DAYS"], ["italic", "standing"], ["caps", "TOP 3%"]],
  },
  { caps: 64.05, italic: 39.71, gap: 15, parts: [["italic", "and introducing"], ["caps", "THE MIDNIGHT MARATHONER"]] },
]

const POSTERS = [
  { src: art.POSTER_1, left: 75, top: 26, rotate: -8 },
  { src: art.POSTER_2, left: 293, top: 0, rotate: -3 },
  { src: art.POSTER_3, left: 513, top: 0, rotate: 2 },
  { src: art.POSTER_4, left: 731, top: 26, rotate: 7 },
]

/** The finale card (`card-back-cover.html`), 1080 x 1920, with four rotated posters. */
function BackCoverCard(): ReactElement {
  return (
    <div style={{ display: "flex", position: "relative", width: 1080, height: 1920, backgroundColor: PAPER, color: ULTRAMARINE }}>
      <Masthead ink={ULTRAMARINE} />
      <div style={{ display: "flex", position: "absolute", left: 0, top: 340, width: 1080, height: 470 }}>
        {POSTERS.map((p) => (
          <Img
            key={p.left}
            src={p.src}
            width={270}
            height={405}
            style={{ position: "absolute", left: p.left, top: p.top, transform: `rotate(${p.rotate}deg)`, border: `5px solid ${ULTRAMARINE}`, borderRadius: 6 }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex", position: "absolute", left: 72, top: 850, width: CARD_MEASURE, flexDirection: "column", alignItems: "center",
          borderTop: `3px solid ${ULTRAMARINE}`, borderBottom: `3px solid ${ULTRAMARINE}`, paddingTop: 26, paddingBottom: 22,
        }}
      >
        {BILLING.map((row) => (
          <div key={row.parts.map(([, t]) => t).join(" ")} style={{ display: "flex", alignItems: "baseline", justifyContent: "center", marginBottom: 6 }}>
            {row.parts.map(([kind, text], i) => {
              const style = { marginLeft: i === 0 ? 0 : row.gap }
              return kind === "caps" ? (
                <Line key={text} text={text} face={{ wdth: 62, weight: 700, size: row.caps, measure: CARD_MEASURE }} lineHeight={1.02} style={style} />
              ) : (
                <Text key={text} text={text} family="textItalic" size={row.italic} style={style} />
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", position: "absolute", left: 72, top: 1490, width: CARD_MEASURE, flexDirection: "column" }}>
        <Text text="The numbers come from my history on Chester Family Plex." family="text" size={34} style={{ lineHeight: "44px" }} />
        <Text text="Some of the words were written by AI." family="text" size={34} style={{ lineHeight: "44px" }} />
      </div>
      <Soundtrack src={art.BACK_COVER_BARS} ink={ULTRAMARINE} top={1690} />
    </div>
  )
}

const OG_STATS = ["1,307 hours", "Top 3% on the server", "23-day streak"]

/** The link preview (`card-og.html`), 1200 x 630. */
function OgCard(): ReactElement {
  return (
    <div style={{ display: "flex", position: "relative", width: 1200, height: 630, backgroundColor: ULTRAMARINE, color: PAPER, flexDirection: "column", padding: "44px 60px 36px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${PAPER}`, paddingBottom: 14 }}>
        <Line text="Chester Family Plex" face={{ ...LABEL, size: 26, measure: 400 }} />
        <Line text="Vol. 4, No. K7Q4" face={{ ...LABEL, size: 22, measure: 300 }} />
        <Line text="Rewind 2026" face={{ wdth: 125, weight: 900, size: 26, measure: 300 }} />
      </div>
      <div style={{ display: "flex", flexGrow: 1, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <Text text={"I’m the"} family="display" size={54} style={{ lineHeight: "56px" }} />
          <Nameplate text="Midnight Marathoner" measure={640} sizeMax={150} lineHeight={0.86} />
          <div style={{ display: "flex", marginTop: 24 }}>
            {OG_STATS.map((text, i) => (
              <Line
                key={text}
                text={text}
                face={{ wdth: 87.5, weight: 700, size: 28, measure: 300 }}
                style={{ lineHeight: "32px", ...(i > 0 ? { marginLeft: 20, paddingLeft: 20, borderLeft: `2px solid ${PAPER}` } : {}) }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", width: 360, height: 360 }}>
          <Img src={art.OG_CLOCK} width={360} height={360} />
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 360, height: 360, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <Line text="34%" face={{ wdth: 75, weight: 900, size: 58, measure: 200 }} style={{ lineHeight: "56px" }} />
            <Text text="started" family="textItalic" size={19} style={{ lineHeight: "22px", marginTop: 4 }} />
            <Text text={"10 PM to 4 AM"} family="textItalic" size={19} style={{ lineHeight: "22px" }} />
          </div>
        </div>
      </div>
      <Img src={art.OG_BARS} width={1080} height={54} />
    </div>
  )
}

export interface MockupCard {
  name: "centrefold" | "back-cover" | "og"
  width: number
  height: number
  /** Has poster artwork: NFR-10 allows 1.2 s instead of 500 ms. */
  artwork: boolean
  render: () => ReactElement
}

export const MOCKUP_CARDS: readonly MockupCard[] = [
  { name: "centrefold", width: 1080, height: 1920, artwork: false, render: CentrefoldCard },
  { name: "back-cover", width: 1080, height: 1920, artwork: true, render: BackCoverCard },
  { name: "og", width: 1200, height: 630, artwork: false, render: OgCard },
]
