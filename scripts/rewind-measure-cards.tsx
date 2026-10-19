#!/usr/bin/env tsx
/**
 * Measures the Rewind cards on the installed `next/og` (plan step P2.14,
 * design 6.4): render timings against NFR-10, and the card slack.
 *
 *   npm run rewind:measure-cards                # print the table, write PNGs
 *   npm run rewind:measure-cards -- --record    # also write lib/rewind/cards/measurements.json
 *   npm run rewind:measure-cards -- --check     # render each card twice, print JSON (the render test)
 *
 * - **Timing.** Each mockup card renders once in each of 3 fresh processes
 *   (cold: the first render, including loading `@vercel/og`, its WASM and the
 *   fonts), then 20 times in this process after one warm-up (warm). p50 and
 *   p95 are nearest-rank. PNGs go to `${REWIND_CACHE_DIR}/measure/`.
 * - **Slack.** Every title of `evals/rewind/data/titles-200.json` is fitted in
 *   the card roles; each fitted line is drawn alone on a transparent band, and
 *   its rightmost column with any ink is compared with the width `fitLines`
 *   predicted. `CARD_SLACK` should be the worst overflow plus 0.5%.
 * - **Kerning.** Pairs from the card metrics' biggest kerns are drawn alone,
 *   and the drawn advance is compared with the metrics' advance with and
 *   without the kern, to see which pairs Satori skips.
 */

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"
import { inflateSync } from "node:zlib"

import { ImageResponse } from "next/og"
import type { ReactElement } from "react"

import titles from "@/evals/rewind/data/titles-200.json"
import { getEnv } from "@/lib/env"
import { CARD_TITLE_ROLES, lineStyle, MOCKUP_CARDS } from "@/lib/rewind/cards/__fixtures__/mockup-cards"
import { archivoFamily, loadCardFonts } from "@/lib/rewind/cards/fonts"
import { CARD_VERSION } from "@/lib/rewind/cards/version"
import { CARD_SLACK, fitLines, type FitResult } from "@/lib/rewind/typeset/fit-lines"
import { measurer } from "@/lib/rewind/typeset/measure"
import { cardMetrics } from "@/lib/rewind/typeset/metrics"

const COLD_RUNS = 3
const WARM_RUNS = 20
const X0 = 40

async function render(element: ReactElement, width: number, height: number): Promise<Buffer> {
  const fonts = await loadCardFonts()
  return Buffer.from(await new ImageResponse(element, { width, height, fonts }).arrayBuffer())
}

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await fn()
  return Math.round((performance.now() - start) * 10) / 10
}

const rank = (sorted: number[], p: number) => sorted[Math.min(sorted.length, Math.ceil(p * sorted.length)) - 1]
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")

/** Decodes an 8-bit, non-interlaced RGBA PNG (what resvg writes) to its alpha channel. */
function alpha(png: Buffer): { width: number; height: number; a: Uint8Array } {
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw new Error("Expected an 8-bit, non-interlaced RGBA PNG")
  const idat: Buffer[] = []
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    if (png.toString("latin1", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)))
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const left = x >= 4 ? out[y * stride + x - 4] : 0
      const up = y > 0 ? out[(y - 1) * stride + x] : 0
      const ul = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0
      const p = left + up - ul
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - ul) ? left : Math.abs(p - up) <= Math.abs(p - ul) ? up : ul
      const pred = [0, left, up, (left + up) >> 1, paeth][filter]
      out[y * stride + x] = (v + pred) & 0xff
    }
  }
  const a = new Uint8Array(width * height)
  for (let i = 0; i < a.length; i++) a[i] = out[i * 4 + 3]
  return { width, height, a }
}

/** Leftmost and rightmost columns with any ink in rows [top, bottom), as edges relative to X0. */
function inkSpan(img: ReturnType<typeof alpha>, top: number, bottom: number): { left: number; right: number } {
  let left = Infinity
  let right = -Infinity
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.a[y * img.width + x] === 0) continue
      left = Math.min(left, x)
      right = Math.max(right, x + 1)
    }
  }
  return { left: left - X0, right: right - X0 }
}

interface Band {
  text: string
  family: string
  size: number
  letterSpacing: number
}

/** Draws each band alone on a transparent 1080 px canvas, one under the other, and returns each one's ink span. */
async function measureBands(bands: Band[]): Promise<{ left: number; right: number }[]> {
  const heights = bands.map((b) => Math.ceil(b.size * 1.6))
  const total = heights.reduce((a, b) => a + b, 0)
  const tops = heights.map((_, i) => heights.slice(0, i).reduce((a, b) => a + b, 0))
  const element = (
    <div style={{ display: "flex", position: "relative", width: 1080, height: total }}>
      {bands.map((b, i) => (
        <div
          key={i}
          style={{
            display: "flex", position: "absolute", left: X0, top: tops[i], height: heights[i], lineHeight: `${heights[i]}px`,
            fontFamily: b.family, fontSize: b.size, letterSpacing: b.letterSpacing, whiteSpace: "nowrap", color: "#000",
          }}
        >
          {b.text}
        </div>
      ))}
    </div>
  )
  const img = alpha(await render(element, 1080, total))
  return bands.map((_, i) => inkSpan(img, tops[i], tops[i] + heights[i]))
}

interface Fitted {
  role: string
  title: string
  fit: FitResult
  weight: number
}

async function slack() {
  const fitted: Fitted[] = []
  for (const [role, { opts, text }] of Object.entries(CARD_TITLE_ROLES)) {
    for (const { title } of titles.titles) {
      const fit = fitLines(text(title), opts)
      if (!fit.safeMode) fitted.push({ role, title, fit, weight: opts.weight })
    }
  }
  const lines = fitted.flatMap(({ role, title, fit, weight }) =>
    fit.lines.map((line, i) => {
      const style = lineStyle(fit, i, weight)
      return { role, title, line, band: { text: line.text, family: String(style.fontFamily), size: fit.size, letterSpacing: Number(style.letterSpacing) } }
    }),
  )
  const spans: { left: number; right: number }[] = []
  for (let i = 0; i < lines.length; i += 24) spans.push(...(await measureBands(lines.slice(i, i + 24).map((l) => l.band))))
  const rows = lines.map((l, i) => ({
    role: l.role, title: l.title, text: l.line.text, wdth: l.line.wdth, size: l.band.size,
    predicted: l.line.width, inkLeft: spans[i].left, inkRight: spans[i].right,
    overflow: (spans[i].right - l.line.width) / l.line.width,
  }))
  const worst = rows.reduce((a, b) => (b.overflow > a.overflow ? b : a))
  const overflowing = rows.filter((r) => r.overflow > 0).length
  return {
    titles: fitted.length / Object.keys(CARD_TITLE_ROLES).length,
    lines: rows.length,
    overflowing,
    worst,
    recommended: Math.ceil((Math.max(0, worst.overflow) + 0.005) * 1000) / 1000,
    widestInk: Math.max(...rows.map((r) => r.inkRight)),
    leftmostInk: Math.min(...rows.map((r) => r.inkLeft)),
  }
}

/** The ten biggest kerns of the W100 Black card face, as pairs of printable characters. */
function kernPairs(): string[] {
  const m = measurer(cardMetrics)
  const chars = "AFLPTVWYfkrvwyacdegosu.,".split("")
  const pairs = chars.flatMap((a) => chars.map((b) => a + b)).filter((p) => /[A-Z]/.test(p))
  const kern = (p: string) => m.em(p, 100, 900, 0, false) - m.em(p[0], 100, 900, 0, false) - m.em(p[1], 100, 900, 0, false)
  return pairs.sort((a, b) => kern(a) - kern(b)).slice(0, 12)
}

/**
 * For each pair: is its kern drawn inside the word, and does the next word
 * move by it? Satori lays words out by summing grapheme advances, so a word's
 * kerning can be drawn and still be missing from where the next word starts.
 */
async function kerning() {
  const m = measurer(cardMetrics)
  const size = 200
  const em = (text: string) => m.em(text, 100, 900, 0, false) * size
  const round = (n: number) => Math.round(n * 10) / 10
  const pairs = kernPairs()
  // Right ink edges of: the pair, its second glyph alone, the pair then " I", and "I" alone.
  const texts = pairs.flatMap((p) => [p, p[1], `${p} I`])
  const spans = await measureBands([...texts, "I"].map((text) => ({ text, family: archivoFamily(100, 900), size, letterSpacing: 0 })))
  const iRight = spans[spans.length - 1].right
  return pairs.map((pair, i) => {
    const kern = em(pair) - em(pair[0]) - em(pair[1])
    const drawn = spans[3 * i].right - spans[3 * i + 1].right - em(pair[0])
    // Where "I" starts, against where it would start with and without every kern before it.
    const start = spans[3 * i + 2].right - iRight
    const kerned = em(`${pair} `)
    const unkerned = em(pair[0]) + em(pair[1]) + em(" ")
    return {
      pair,
      kernPx: round(kern),
      drawnKernPx: round(drawn),
      drawnInWord: Math.abs(drawn - kern) < Math.abs(drawn),
      nextWordShiftPx: round(start - kerned),
      inLayout: Math.abs(start - kerned) < Math.abs(start - unkerned),
    }
  })
}

/** Does Satori apply `tnum`? Proportional and tabular "1" differ in Archivo. */
async function tabularFigures(): Promise<boolean> {
  const family = archivoFamily(75, 900)
  const [plain, tnum] = await Promise.all(
    [{}, { fontFeatureSettings: '"tnum"', fontVariantNumeric: "tabular-nums" }].map((extra) =>
      render(<div style={{ display: "flex", fontFamily: family, fontSize: 200, ...extra }}>1111</div>, 1000, 300),
    ),
  )
  return sha256(plain) !== sha256(tnum)
}

function cold(name: string): number[] {
  return Array.from({ length: COLD_RUNS }, () => {
    const child = spawnSync(process.execPath, [...process.execArgv, __filename, "--cold", name], { encoding: "utf8" })
    if (child.status !== 0) throw new Error(`Cold render of ${name} failed:\n${child.stderr}`)
    return Number(JSON.parse(child.stdout.trim().split("\n").pop() ?? "").ms)
  })
}

async function main() {
  const { values } = parseArgs({ options: { cold: { type: "string" }, check: { type: "boolean" }, record: { type: "boolean" } } })
  if (values.cold) {
    const card = MOCKUP_CARDS.find((c) => c.name === values.cold)
    if (!card) throw new Error(`No card ${values.cold}`)
    console.log(JSON.stringify({ ms: await timed(() => render(card.render(), card.width, card.height)) }))
    return
  }
  if (values.check) {
    const out = []
    for (const card of MOCKUP_CARDS) {
      const [a, b] = [await render(card.render(), card.width, card.height), await render(card.render(), card.width, card.height)]
      out.push({ name: card.name, artwork: card.artwork, width: a.readUInt32BE(16), height: a.readUInt32BE(20), sha256: [sha256(a), sha256(b)] })
    }
    console.log(JSON.stringify(out))
    return
  }

  const dir = path.join(getEnv().REWIND_CACHE_DIR, "measure")
  mkdirSync(dir, { recursive: true })
  const cards = []
  for (const card of MOCKUP_CARDS) {
    const coldMs = cold(card.name)
    const png = await render(card.render(), card.width, card.height)
    writeFileSync(path.join(dir, `card-${card.name}.png`), png)
    const warm: number[] = []
    for (let i = 0; i < WARM_RUNS; i++) warm.push(await timed(() => render(card.render(), card.width, card.height)))
    warm.sort((a, b) => a - b)
    const targetMs = card.artwork ? 1200 : 500
    const p50 = rank(warm, 0.5)
    const p95 = rank(warm, 0.95)
    cards.push({ name: card.name, size: `${card.width}x${card.height}`, artwork: card.artwork, coldMs, warmP50Ms: p50, warmP95Ms: p95, warmMs: warm, targetMs, meetsTarget: p95 < targetMs, bytes: png.length })
  }
  const fitting = await slack()
  const kerns = await kerning()
  const tnum = await tabularFigures()

  console.log("card        cold (ms)              warm p50   warm p95   NFR-10")
  for (const c of cards) {
    console.log(`${c.name.padEnd(11)} ${c.coldMs.join(", ").padEnd(22)} ${String(c.warmP50Ms).padStart(8)}   ${String(c.warmP95Ms).padStart(8)}   ${c.meetsTarget ? "pass" : "FAIL"} (< ${c.targetMs})`)
  }
  const w = fitting.worst
  console.log(`\nslack: ${fitting.lines} lines from ${fitting.titles} titles; ${fitting.overflowing} overflow; worst ${(w.overflow * 100).toFixed(2)}% ("${w.text}", ${w.role}, ${w.size} px, W${w.wdth}: ink ${w.inkRight} px vs ${w.predicted} px)`)
  console.log(`CARD_SLACK now ${CARD_SLACK}; measured worst overflow + 0.5% = ${fitting.recommended}`)
  const count = (key: "drawnInWord" | "inLayout") => `${kerns.filter((k) => k[key]).length} of ${kerns.length}`
  console.log(`kerning: drawn inside the word for ${count("drawnInWord")} pairs; in the next word's position for ${count("inLayout")}`)
  console.log(`tnum applied by Satori: ${tnum}`)
  console.log(`PNGs in ${dir}\n${CARD_VERSION}`)

  if (values.record) {
    const record = {
      measuredOn: new Date().toISOString().slice(0, 10),
      versions: {
        next: (JSON.parse(readFileSync(path.join(process.cwd(), "node_modules/next/package.json"), "utf8")) as { version: string }).version,
        vercelOg: /\+og@([\d.]+)\+/.exec(CARD_VERSION)?.[1],
        satori: /\+satori@([\d.]+)\+/.exec(CARD_VERSION)?.[1],
      },
      cardVersion: CARD_VERSION,
      environment: {
        node: process.version, nodeEnv: process.env.NODE_ENV ?? null, cpus: os.cpus().length, cpu: os.cpus()[0]?.model ?? null,
        platform: `${os.platform()} ${os.release()}`,
      },
      method: { coldRuns: COLD_RUNS, warmRuns: WARM_RUNS, percentiles: "nearest rank", slack: "rightmost ink column (alpha > 0) of each fitted line drawn alone, against fitLines' predicted width" },
      cards,
      slack: { cardSlack: CARD_SLACK, ...fitting },
      kerning: kerns,
      tabularFigures: tnum,
    }
    writeFileSync(path.join(process.cwd(), "lib/rewind/cards/measurements.json"), `${JSON.stringify(record, null, 2)}\n`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
