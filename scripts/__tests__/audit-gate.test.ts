/**
 * @jest-environment node
 */

/**
 * The production-dependency audit gate (P1.5): a clean report passes; a new
 * high or critical advisory fails, and so does an expired exception.
 */

import { evaluateAudit, exceptionProblems, gatedAdvisories } from "../audit/gate.mjs"

const NOW = new Date("2026-10-19T12:00:00Z")

type Severity = "low" | "moderate" | "high" | "critical"

function advisory(ghsa: string, severity: Severity, name = "next") {
  return {
    source: 1100000,
    name,
    dependency: name,
    title: `Example ${severity} advisory`,
    url: `https://github.com/advisories/${ghsa}`,
    severity,
    range: "<99.0.0",
  }
}

/** An `npm audit --json` (auditReportVersion 2) report. */
function report(vulnerabilities: Record<string, { name: string; severity: Severity; via: unknown[] }>) {
  return { auditReportVersion: 2, vulnerabilities, metadata: {} }
}

const CLEAN = report({})

describe("evaluateAudit", () => {
  it("passes a clean report", () => {
    expect(evaluateAudit(CLEAN, [], NOW).failures).toEqual([])
  })

  it("passes low and moderate advisories", () => {
    const moderate = report({
      next: { name: "next", severity: "moderate", via: [advisory("GHSA-aaaa-bbbb-cccc", "moderate")] },
    })
    expect(evaluateAudit(moderate, [], NOW).failures).toEqual([])
  })

  it("fails a new high advisory", () => {
    const high = report({ next: { name: "next", severity: "high", via: [advisory("GHSA-aaaa-bbbb-cccc", "high")] } })
    const { failures } = evaluateAudit(high, [], NOW)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/^high GHSA-aaaa-bbbb-cccc in next/)
  })

  it("fails a critical advisory reached through another package", () => {
    const critical = report({
      "next-auth": { name: "next-auth", severity: "critical", via: ["jose"] },
      jose: { name: "jose", severity: "critical", via: [advisory("GHSA-dddd-eeee-ffff", "critical", "jose")] },
    })
    const { failures } = evaluateAudit(critical, [], NOW)
    expect(failures).toEqual([expect.stringMatching(/^critical GHSA-dddd-eeee-ffff in jose/)])
  })

  it("passes an advisory with a current exception", () => {
    const high = report({ next: { name: "next", severity: "high", via: [advisory("GHSA-aaaa-bbbb-cccc", "high")] } })
    const exceptions = [{ id: "GHSA-aaaa-bbbb-cccc", reason: "No fix released yet", expires: "2026-10-30" }]
    const result = evaluateAudit(high, exceptions, NOW)
    expect(result.failures).toEqual([])
    expect(result.excepted.map((entry: { id: string }) => entry.id)).toEqual(["GHSA-aaaa-bbbb-cccc"])
  })

  it("fails an expired exception, even when its advisory is gone", () => {
    const exceptions = [{ id: "GHSA-aaaa-bbbb-cccc", reason: "No fix released yet", expires: "2026-10-18" }]
    expect(evaluateAudit(CLEAN, exceptions, NOW).failures).toEqual([
      expect.stringMatching(/GHSA-aaaa-bbbb-cccc expired on 2026-10-18/),
    ])
  })
})

describe("exceptionProblems", () => {
  it("accepts an exception that expires today or within 14 days", () => {
    expect(
      exceptionProblems(
        [
          { id: "GHSA-1", reason: "r", expires: "2026-10-19" },
          { id: "GHSA-2", reason: "r", expires: "2026-11-02" },
        ],
        NOW
      )
    ).toEqual([])
  })

  it("refuses an expiry more than 14 days out", () => {
    expect(exceptionProblems([{ id: "GHSA-1", reason: "r", expires: "2026-11-03" }], NOW)).toEqual([
      expect.stringMatching(/more than 14 days out/),
    ])
  })

  it("refuses an exception without a reason or a valid date", () => {
    expect(exceptionProblems([{ id: "GHSA-1", reason: "", expires: "soon" }], NOW)).toEqual([
      expect.stringMatching(/needs an id and a reason/),
      expect.stringMatching(/needs an expiry date/),
    ])
  })
})

describe("gatedAdvisories", () => {
  it("lists one entry per advisory with every package it reaches", () => {
    const shared = advisory("GHSA-aaaa-bbbb-cccc", "high")
    const advisories = gatedAdvisories(
      report({
        next: { name: "next", severity: "high", via: [shared] },
        "eslint-config-next": { name: "eslint-config-next", severity: "high", via: [{ ...shared, name: "next" }] },
      })
    )
    expect(advisories).toEqual([expect.objectContaining({ id: "GHSA-aaaa-bbbb-cccc", packages: ["next", "eslint-config-next"] })])
  })
})
