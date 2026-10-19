/**
 * @jest-environment node
 */

/**
 * e2e/a11y/baseline.ts keeps the axe burn-down baseline honest (P1.7): a new
 * rule or a rise fails, a drop asks for an update, and the writer never
 * raises a count.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  compareToBaseline,
  enforceBaseline,
  lowerBaseline,
  staleRoutes,
  UPDATE_COMMAND,
  writeBaseline,
  type AxeBaseline,
} from "@/e2e/a11y/baseline"
import { INCOMPLETE_CONTRAST_KEY, summarizeAxe, type AxeSummary } from "@/e2e/a11y/summarize"

const ROUTE = "admin /admin/queues"

function summary(counts: Record<string, number>): AxeSummary {
  const targets = Object.fromEntries(Object.keys(counts).map((key) => [key, ["#a", "#b", "#c"]]))
  return { counts, targets }
}

const baseline: AxeBaseline = {
  [ROUTE]: { "color-contrast|serious": 3, "region|moderate": 1 },
}

describe("summarizeAxe", () => {
  it("matches the documented example", () => {
    expect(
      summarizeAxe({
        violations: [{ id: "label", impact: "critical", nodes: [{ target: ["#q"] }] }],
        incomplete: [{ id: "color-contrast", impact: "serious", nodes: [{ target: ["h1"] }] }],
      }).counts
    ).toEqual({ [INCOMPLETE_CONTRAST_KEY]: 1, "label|critical": 1 })
  })

  it("counts nodes per rule and impact, keeping three targets", () => {
    const nodes = ["#1", "#2", "#3", "#4"].map((id) => ({ target: [id] }))
    const result = summarizeAxe({
      violations: [
        { id: "color-contrast", impact: "serious", nodes },
        { id: "aria-allowed-role", impact: "minor", nodes: [{ target: ["nav"], impact: "moderate" }] },
      ],
      incomplete: [{ id: "aria-hidden-focus", impact: "serious", nodes: [{ target: ["#x"] }] }],
    })
    expect(result.counts).toEqual({ "aria-allowed-role|moderate": 1, "color-contrast|serious": 4 })
    expect(result.targets["color-contrast|serious"]).toEqual(["#1", "#2", "#3"])
  })
})

describe("compareToBaseline", () => {
  it("matches the documented example", () => {
    expect(
      compareToBaseline(
        "/admin/queues",
        { counts: { "color-contrast|serious": 1 }, targets: {} },
        { "/admin/queues": { "color-contrast|serious": 2 } }
      )
    ).toEqual({ regressions: [], improvements: ["/admin/queues: color-contrast|serious fell from 2 to 1"] })
  })

  it("fails a new rule, naming the route and the first targets", () => {
    const diff = compareToBaseline(ROUTE, summary({ ...baseline[ROUTE], "label|critical": 1 }), baseline)
    expect(diff.regressions).toEqual([`${ROUTE}: label|critical is new (1 nodes); first targets: #a, #b, #c`])
    expect(diff.improvements).toEqual([])
  })

  it("fails a rise", () => {
    const diff = compareToBaseline(ROUTE, summary({ ...baseline[ROUTE], "color-contrast|serious": 4 }), baseline)
    expect(diff.regressions).toEqual([
      `${ROUTE}: color-contrast|serious rose from 3 to 4; first targets: #a, #b, #c`,
    ])
  })

  it("reports a drop and a vanished rule as improvements", () => {
    const diff = compareToBaseline(ROUTE, summary({ "color-contrast|serious": 2 }), baseline)
    expect(diff.regressions).toEqual([])
    expect(diff.improvements).toEqual([
      `${ROUTE}: color-contrast|serious fell from 3 to 2`,
      `${ROUTE}: region|moderate fell from 1 to 0`,
    ])
  })

  it("treats a route the baseline does not list as empty", () => {
    expect(compareToBaseline("public /new", summary({ "region|moderate": 1 }), baseline).regressions).toHaveLength(1)
  })
})

describe("lowerBaseline", () => {
  it("lowers counts and drops rules that are gone", () => {
    expect(lowerBaseline(baseline, ROUTE, { "color-contrast|serious": 1 })).toEqual({
      [ROUTE]: { "color-contrast|serious": 1 },
    })
  })

  it("never raises a count", () => {
    expect(() => lowerBaseline(baseline, ROUTE, { "color-contrast|serious": 4 })).toThrow(
      /Refusing to raise the axe baseline for admin \/admin\/queues: color-contrast\|serious \(3 -> 4\)/
    )
  })

  it("never adds a rule to a listed route", () => {
    expect(() => lowerBaseline(baseline, ROUTE, { ...baseline[ROUTE], "label|critical": 1 })).toThrow(
      /label\|critical \(0 -> 1\)/
    )
  })

  it("records a route the baseline does not list yet", () => {
    expect(lowerBaseline(baseline, "public /new", { "region|moderate": 2 })["public /new"]).toEqual({
      "region|moderate": 2,
    })
  })
})

describe("staleRoutes", () => {
  it("lists baseline routes missing from the route table", () => {
    expect(staleRoutes({ ...baseline, "public /gone": {} }, [ROUTE])).toEqual(["public /gone"])
  })
})

describe("enforceBaseline", () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "axe-baseline-"))
    file = path.join(dir, "axe-baseline.json")
    writeBaseline(baseline, file)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("passes when the counts match", () => {
    expect(() => enforceBaseline({ route: ROUTE, summary: summary(baseline[ROUTE]), update: false, file })).not.toThrow()
  })

  it("fails a rise with the regression", () => {
    expect(() =>
      enforceBaseline({ route: ROUTE, summary: summary({ ...baseline[ROUTE], "label|critical": 2 }), update: false, file })
    ).toThrow(/New accessibility violations[\s\S]*label\|critical is new/)
  })

  it("asks for an update on a drop", () => {
    let message = ""
    try {
      enforceBaseline({ route: ROUTE, summary: summary({ "color-contrast|serious": 3 }), update: false, file })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(UPDATE_COMMAND)
    expect(message).toContain("region|moderate fell from 1 to 0")
  })

  it("writes the lowered counts in update mode", () => {
    enforceBaseline({ route: ROUTE, summary: summary({ "color-contrast|serious": 2 }), update: true, file })
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ [ROUTE]: { "color-contrast|serious": 2 } })
  })

  it("refuses to raise in update mode and leaves the file alone", () => {
    expect(() =>
      enforceBaseline({ route: ROUTE, summary: summary({ "color-contrast|serious": 5 }), update: true, file })
    ).toThrow(/Refusing to raise/)
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(baseline)
  })
})
