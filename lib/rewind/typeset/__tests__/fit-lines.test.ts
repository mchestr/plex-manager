/**
 * @jest-environment node
 */
import titles from "@/evals/rewind/data/titles-200.json"
import { CARD_SLACK, fitLines, type FitOptions } from "@/lib/rewind/typeset/fit-lines"
import { measurer } from "@/lib/rewind/typeset/measure"
import { cardMetrics, pageMetrics } from "@/lib/rewind/typeset/metrics"

const MEASURE = 358

const nameplate = (overrides: Partial<FitOptions> = {}): FitOptions => ({
  role: "nameplate",
  metrics: pageMetrics,
  weight: 900,
  measure: MEASURE,
  maxLines: 2,
  sizeMin: 34,
  sizeMax: 200,
  ...overrides,
})

/** The No. 1 title role: Archivo 900 nameplate, 34-52 px, up to 3 lines. */
const NO1_TITLE = nameplate({ maxLines: 3, sizeMin: 34, sizeMax: 52 })

const SAFE = /[\u0180-\u024F\u1E00-\u1EFF\u0370-\u03FF\u0400-\u04FF\u0590-\u06FF\u0900-\u0E7F\u3000-\u9FFF\uAC00-\uD7AF]/

describe("fitLines: the design 15.3 mockup fits", () => {
  it('sets "Rewind" at 90.4 px and width 100', () => {
    const fit = fitLines("Rewind", nameplate({ widths: [100], maxLines: 1 }))
    expect(Math.abs(fit.size - 90.4)).toBeLessThanOrEqual(0.2)
    expect(fit.lines).toEqual([expect.objectContaining({ text: "Rewind", wdth: 100 })])
  })

  it('sets "1,307" at 185.3 px and width 62 with tabular figures', () => {
    const fit = fitLines("1,307", nameplate({ widths: [62, 75], maxLines: 1, tnum: true }))
    expect(Math.abs(fit.size - 185.3)).toBeLessThanOrEqual(0.2)
    expect(fit.lines.map((l) => l.wdth)).toEqual([62])
  })

  it('sets "Midnight / Marathoner" at 87.2 px, at widths 75 and 62', () => {
    const fit = fitLines("Midnight Marathoner", nameplate())
    expect(Math.abs(fit.size - 87.2)).toBeLessThanOrEqual(0.2)
    expect(fit.lines.map((l) => [l.text, l.wdth])).toEqual([
      ["Midnight", 75],
      ["Marathoner", 62],
    ])
  })

  it('sets "The Lord of the Rings: / The Rings of Power" at 49.4 px and width 62', () => {
    const fit = fitLines("The Lord of the Rings: The Rings of Power", NO1_TITLE)
    expect(Math.abs(fit.size - 49.4)).toBeLessThanOrEqual(0.2)
    expect(fit.lines.map((l) => [l.text, l.wdth])).toEqual([
      ["The Lord of the Rings:", 62],
      ["The Rings of Power", 62],
    ])
  })
})

describe("fitLines: rules", () => {
  it("matches the module's @example", () => {
    const fit = fitLines("Midnight Marathoner", {
      role: "nameplate", metrics: pageMetrics, weight: 900,
      measure: 358, maxLines: 2, sizeMin: 34, sizeMax: 120,
    })
    expect(fit.size).toBe(87.1)
    expect(fit.lines.map((l) => l.wdth)).toEqual([75, 62])
  })

  it("applies the one-step spread rule to nameplate lines", () => {
    const fit = fitLines("Furiosa: A Mad Max Saga", NO1_TITLE)
    expect(fit.lines.map((l) => [l.text, l.wdth])).toEqual([
      ["Furiosa:", 87.5],
      ["A Mad Max Saga", 75],
    ])
    // Alone at the same size, "Furiosa:" would take a wider step than the cap allows.
    const alone = fitLines("Furiosa:", { ...NO1_TITLE, sizeMin: fit.size, sizeMax: fit.size, maxLines: 1 })
    expect(alone.lines[0].wdth).toBeGreaterThan(87.5)
  })

  it("sentence mode gives every line one shared step, flush left", () => {
    const fit = fitLines("The shows you kept coming back to", {
      role: "sentence",
      metrics: pageMetrics,
      weight: 850,
      measure: MEASURE,
      maxLines: 3,
      sizeMin: 40,
      sizeMax: 42,
    })
    expect(fit.size).toBe(42)
    expect(fit.lines.length).toBeGreaterThan(1)
    expect(new Set(fit.lines.map((l) => l.wdth)).size).toBe(1)
    for (const line of fit.lines) expect(line.width).toBeLessThanOrEqual(MEASURE)
  })

  it("prefers a break before a function word that saves a one-word last line", () => {
    const fit = fitLines("Only Murders in the Building", { ...NO1_TITLE, sizeMax: 40, maxLines: 2 })
    expect(fit.lines.map((l) => l.text)).toEqual(["Only Murders in", "the Building"])
  })

  it("cuts a list title beyond 3 lines short with an ellipsis and keeps the full title in ariaLabel", () => {
    const title = "Borat Subsequent Moviefilm: Delivery of Prodigious Bribe to American Regime for Make Benefit Once Glorious Nation of Kazakhstan"
    const fit = fitLines(title, {
      role: "sentence",
      metrics: pageMetrics,
      weight: 760,
      widths: [87.5],
      measure: 280,
      maxLines: 3,
      sizeMin: 18,
      sizeMax: 19,
    })
    expect(fit.ellipsized).toBe(true)
    expect(fit.lines).toHaveLength(3)
    expect(fit.lines[2].text.endsWith("\u2026")).toBe(true)
    expect(fit.ariaLabel).toBe(title)
    for (const line of fit.lines) expect(line.width).toBeLessThanOrEqual(280)
  })

  it("never breaks a word, dropping to the 22 px floor instead", () => {
    const fit = fitLines("Supercalifragilisticexpialidocious", NO1_TITLE)
    expect(fit.lines).toHaveLength(1)
    expect(fit.size).toBeGreaterThanOrEqual(22)
    expect(fit.size).toBeLessThan(34)
  })

  it("fits card lines from the card metrics inside the slack", () => {
    const measure = 936 / (1 + CARD_SLACK)
    const fit = fitLines("Midnight Marathoner", { ...nameplate({ metrics: cardMetrics, measure, sizeMax: 400 }) })
    expect(fit.lines.map((l) => l.wdth)).toEqual([75, 62])
    expect(Math.abs(fit.size - 226.5)).toBeLessThanOrEqual(6)
    for (const line of fit.lines) expect(line.width * (1 + CARD_SLACK)).toBeLessThanOrEqual(936)
  })

  it("returns safe mode for code points outside the subset", () => {
    for (const title of ["4 luni, 3 săptămâni și 2 zile", "Cánh đồng bất tận", "千と千尋の神隠し"]) {
      const fit = fitLines(title, NO1_TITLE)
      expect(fit).toMatchObject({ safeMode: true, ariaLabel: title, lines: [{ text: title }] })
    }
    expect(fitLines("Moartea domnului Lăzărescu", NO1_TITLE).safeMode).toBe(false)
  })

  it("measures with kerning and tracking from the built metrics", () => {
    const m = measurer(pageMetrics)
    expect(m.widths(900)).toEqual([62, 75, 87.5, 100, 112.5, 125])
    expect(m.em("AV", 100, 900, 0, false)).toBeLessThan(m.em("A", 100, 900, 0, false) + m.em("V", 100, 900, 0, false))
    expect(m.em("ab", 100, 900, -0.01, false)).toBeCloseTo(m.em("ab", 100, 900, 0, false) - 0.02, 6)
  })
})

describe("fitLines: the 200-title fixture", () => {
  const list = titles.titles.map((t) => t.title)

  it("holds 200 titles", () => {
    expect(list).toHaveLength(200)
  })

  it.each([
    ["No. 1 title", NO1_TITLE],
    ["list title", { ...NO1_TITLE, role: "sentence", weight: 760, widths: [87.5], sizeMin: 18, sizeMax: 19, measure: 280 } as FitOptions],
  ])("as a %s: fits the measure, keeps every word and holds the floor", (_, opts) => {
    const floor = Math.min(22, opts.sizeMin)
    for (const title of list) {
      const fit = fitLines(title, opts)
      if (SAFE.test(title)) {
        expect(fit.safeMode).toBe(true)
        continue
      }
      expect(fit.safeMode).toBe(false)
      expect(fit.size).toBeGreaterThanOrEqual(floor)
      for (const line of fit.lines) expect(line.width).toBeLessThanOrEqual(opts.measure + 0.01)
      if (!fit.ellipsized) expect(fit.lines.map((l) => l.text).join(" ")).toBe(title)
      expect(fit.ariaLabel).toBe(title)
    }
  })

  it.each([
    "The Lord of the Rings: The Rings of Power",
    "Star Trek: Strange New Worlds",
    "Avatar: The Last Airbender",
    "2001: A Space Odyssey",
    "Star Wars: Episode V - The Empire Strikes Back",
    "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
  ])("prefers the colon break: %s", (title) => {
    expect(list).toContain(title)
    const fit = fitLines(title, NO1_TITLE)
    expect(fit.lines[0].text.endsWith(":")).toBe(true)
  })

  it("returns safe mode for the Romanian ș and the Vietnamese titles", () => {
    const romanian = list.filter((t) => /[șț]/.test(t))
    const vietnamese = list.filter((t) => /[\u01A0-\u01B0\u1EA0-\u1EF9]/.test(t))
    expect(romanian.length).toBeGreaterThan(0)
    expect(vietnamese.length).toBeGreaterThan(0)
    for (const title of [...romanian, ...vietnamese]) expect(fitLines(title, NO1_TITLE).safeMode).toBe(true)
  })

  it("fits all 200 in under 200 ms", () => {
    fitLines("warm up", NO1_TITLE)
    const start = performance.now()
    for (const title of list) fitLines(title, NO1_TITLE)
    expect(performance.now() - start).toBeLessThan(200)
  })
})
