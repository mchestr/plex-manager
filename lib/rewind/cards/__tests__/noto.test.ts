/**
 * @jest-environment node
 *
 * Safe-mode titles (P7.6, design 4.9): faces by Unicode script, subsets cut
 * to exactly the characters a card sets, and the subset cache on disk.
 */

import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import subsetFont from "subset-font"

import { glyphsByFace, loadNotoFonts, notoFaces, notoStack } from "@/lib/rewind/cards/noto"
import { fitCard, safeFit } from "@/lib/rewind/cards/type"

jest.mock("subset-font", () => {
  const actual = jest.requireActual<(font: Buffer, text: string, options?: object) => Promise<Buffer>>("subset-font")
  return { __esModule: true, default: jest.fn((font: Buffer, text: string, options?: object) => actual(font, text, options)) }
})

const JAPANESE = "千と千尋の神隠し"
const ROMANIAN = "Moromeții"

/** The code points a TrueType font's cmap maps (formats 4 and 12). */
function cmapCodePoints(font: ArrayBuffer): Set<number> {
  const view = new DataView(font)
  const tables = view.getUint16(4)
  let cmap = -1
  for (let i = 0; i < tables; i++) {
    const record = 12 + i * 16
    if (String.fromCharCode(...[0, 1, 2, 3].map((k) => view.getUint8(record + k))) === "cmap") cmap = view.getUint32(record + 8)
  }
  const points = new Set<number>()
  const subtables = view.getUint16(cmap + 2)
  for (let i = 0; i < subtables; i++) {
    const offset = cmap + view.getUint32(cmap + 4 + i * 8 + 4)
    const format = view.getUint16(offset)
    if (format === 4) {
      const segments = view.getUint16(offset + 6) / 2
      for (let s = 0; s < segments; s++) {
        const end = view.getUint16(offset + 14 + s * 2)
        const start = view.getUint16(offset + 16 + segments * 2 + s * 2)
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) points.add(cp)
      }
    } else if (format === 12) {
      const groups = view.getUint32(offset + 12)
      for (let g = 0; g < groups; g++) {
        const start = view.getUint32(offset + 16 + g * 12)
        const end = view.getUint32(offset + 20 + g * 12)
        for (let cp = start; cp <= end; cp++) points.add(cp)
      }
    }
  }
  return points
}

const codePoints = (text: string) => new Set(Array.from(text, (ch) => ch.codePointAt(0)!))

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-noto-"))
  process.env.REWIND_CACHE_DIR = dir
  jest.mocked(subsetFont).mockClear()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.REWIND_CACHE_DIR
})

describe("faces by script", () => {
  it("sets a Japanese title in Noto Sans JP", () => {
    expect(notoFaces(JAPANESE)).toEqual(["jp"])
    expect(notoStack(JAPANESE)).toBe("Rewind Noto JP")
  })

  it("sets a Romanian title in Noto Sans", () => {
    expect(notoFaces(ROMANIAN)).toEqual(["sans"])
  })

  it("names the script faces before Noto Sans in a mixed title", () => {
    expect(notoFaces("오징어 게임 Season 2")).toEqual(["kr"])
    expect(notoFaces("Слово пацана")).toEqual(["sans"])
    expect(notoFaces("Fauda فوضى")).toEqual(["arabic", "sans"])
    expect(notoFaces("三体")).toEqual(["sc"])
  })

  it("gives each face only its own characters", () => {
    expect(glyphsByFace([JAPANESE, ROMANIAN])).toEqual(
      new Map([
        ["jp", [...new Set(Array.from(JAPANESE))].sort().join("")],
        ["sans", [...new Set(Array.from(ROMANIAN))].sort().join("")],
      ])
    )
  })
})

describe("safe-mode fitting", () => {
  it("leaves a title the card fonts set to the Archivo fitter", () => {
    expect(fitCard("Severance", { role: "sentence", weight: 700, widths: [87.5], measure: 800, maxLines: 2, sizeMin: 40, sizeMax: 64 }).safeMode).toBe(false)
  })

  it("prints an uncovered title at the fixed size in balanced lines", () => {
    const fit = fitCard("Cuộc đời của những người khác", { role: "nameplate", weight: 900, measure: 600, maxLines: 3, sizeMin: 56, sizeMax: 150 })
    expect(fit.safeMode).toBe(true)
    expect(fit.size).toBe(56)
    expect(fit.lines.map((l) => l.text)).toEqual(["Cuộc đời của", "những người khác"])
  })

  it("breaks CJK between characters and keeps a short title on one line", () => {
    expect(safeFit(JAPANESE, { measure: 900, maxLines: 2, size: 64 }).lines.map((l) => l.text)).toEqual([JAPANESE])
    expect(safeFit(JAPANESE, { measure: 300, maxLines: 2, size: 64 }).lines.map((l) => l.text)).toEqual(["千と千尋", "の神隠し"])
  })

  it("reverses a wholly right-to-left line into visual order", () => {
    expect(safeFit("אבא שלי", { measure: 900, maxLines: 1, size: 64 }).lines[0].text).toBe("ילש אבא")
  })
})

describe("loadNotoFonts", () => {
  it("cuts each face to exactly the characters it sets", async () => {
    const fonts = await loadNotoFonts([JAPANESE, ROMANIAN])
    expect(fonts.map((f) => f.name)).toEqual(["Rewind Noto JP", "Rewind Noto Sans"])
    expect(cmapCodePoints(fonts[0].data as ArrayBuffer)).toEqual(codePoints(JAPANESE))
    expect(cmapCodePoints(fonts[1].data as ArrayBuffer)).toEqual(codePoints(ROMANIAN))
  })

  it("reads the subset from the cache on a second render", async () => {
    const first = await loadNotoFonts([JAPANESE])
    expect(subsetFont).toHaveBeenCalledTimes(1)
    expect(readdirSync(path.join(dir, "fonts")).filter((f) => f.endsWith(".ttf"))).toHaveLength(1)

    const second = await loadNotoFonts([JAPANESE])
    expect(subsetFont).toHaveBeenCalledTimes(1)
    expect(Buffer.from(second[0].data as ArrayBuffer).equals(Buffer.from(first[0].data as ArrayBuffer))).toBe(true)
  })

  it("loads nothing when no text needs safe mode", async () => {
    await expect(loadNotoFonts([])).resolves.toEqual([])
  })
})
