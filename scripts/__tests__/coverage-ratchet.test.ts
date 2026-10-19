/**
 * @jest-environment node
 */

/**
 * The coverage ratchet (P1.5): a value below a floor fails, and `--update`
 * (`raise`) never lowers a floor.
 */

import { check, measure, raise, relativeSummary } from "../coverage/ratchet.mjs"

type Counts = { total: number; covered: number }

function file(covered: number, total = 100) {
  const counts: Counts & { skipped: number; pct: number } = { total, covered, skipped: 0, pct: (covered / total) * 100 }
  return { statements: counts, branches: counts, functions: counts, lines: counts }
}

const ROOT = "/repo"
const SUMMARY = {
  total: file(0),
  "/repo/lib/auth.ts": file(80),
  "/repo/lib/security/rate-limit.ts": file(90),
  "/repo/lib/security/audit-log.ts": file(70),
  "/repo/lib/security-notes.ts": file(10),
  "/repo/components/button.tsx": file(50),
}
const FILES = relativeSummary(SUMMARY, ROOT)

function floors(value: number) {
  return { statements: value, branches: value, functions: value, lines: value }
}

describe("measure", () => {
  it("aggregates a directory's files and leaves the files a path names out of global", () => {
    const measured = measure({ global: floors(0), "./lib/auth.ts": floors(0), "./lib/security/": floors(0) }, FILES)

    expect(measured["./lib/auth.ts"].lines).toBe(80)
    expect(measured["./lib/security/"].lines).toBe(80)
    // lib/security-notes.ts and components/button.tsx: (10 + 50) / 200.
    expect(measured.global.lines).toBe(30)
  })
})

describe("check", () => {
  it("passes values at or above every floor", () => {
    const thresholds = { global: floors(30), "./lib/security/": floors(80) }
    expect(check(thresholds, measure(thresholds, FILES))).toEqual([])
  })

  it("fails a value below a floor", () => {
    const thresholds = { global: floors(30), "./lib/auth.ts": floors(81) }
    const failures = check(thresholds, measure(thresholds, FILES))
    expect(failures).toHaveLength(4)
    expect(failures[0]).toBe("./lib/auth.ts statements: 80.00% is below the floor of 81%")
  })
})

describe("raise", () => {
  it("raises a floor to today's value, rounded down", () => {
    const thresholds = { global: floors(20) }
    const raised = raise(thresholds, { global: { statements: 30.9, branches: 30.9, functions: 30.9, lines: 30.9 } })
    expect(raised.global).toEqual(floors(30))
  })

  it("never lowers a floor", () => {
    const thresholds = { global: floors(60), "./lib/auth.ts": floors(85) }
    const raised = raise(thresholds, measure(thresholds, FILES))
    // Global is 55% today and lib/auth.ts 80%.
    expect(raised.global).toEqual(floors(60))
    expect(raised["./lib/auth.ts"]).toEqual(floors(85))
  })
})
