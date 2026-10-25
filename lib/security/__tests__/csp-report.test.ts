/**
 * The CSP report parser (P11.20): both browser formats, and only safe fields out.
 */

import { cspReportType, parseCspReport } from "@/lib/security/csp-report"

const legacy = (report: Record<string, string>) => JSON.stringify({ "csp-report": report })

describe("cspReportType", () => {
  it("reads the type without parameters or case", () => {
    expect(cspReportType("application/csp-report")).toBe("application/csp-report")
    expect(cspReportType("Application/Reports+JSON; charset=utf-8")).toBe("application/reports+json")
  })

  it("is null for anything else", () => {
    expect(cspReportType("application/json")).toBeNull()
    expect(cspReportType(null)).toBeNull()
  })
})

describe("parseCspReport", () => {
  it("is null for a body that is not JSON or not the type's shape", () => {
    expect(parseCspReport("application/csp-report", "not json")).toBeNull()
    expect(parseCspReport("application/csp-report", JSON.stringify({ other: {} }))).toBeNull()
    expect(parseCspReport("application/reports+json", JSON.stringify({ type: "csp-violation" }))).toBeNull()
  })

  it("falls back to violated-directive, keeps its first word and reads a report-only disposition", () => {
    const [violation] = parseCspReport(
      "application/csp-report",
      legacy({ "document-uri": "https://app.example/help", "violated-directive": "style-src 'self'", "blocked-uri": "inline", disposition: "report" })
    )!
    expect(violation).toEqual({ directive: "style-src", blocked: "inline", documentPath: "/help", disposition: "report" })
  })

  it("names a data: source by its scheme and anything unreadable as unknown", () => {
    const [data] = parseCspReport("application/csp-report", legacy({ "blocked-uri": "data:font/woff2;base64,AAAA" }))!
    expect(data).toEqual({ directive: "unknown", blocked: "data", documentPath: "unknown", disposition: "enforce" })

    const [bad] = parseCspReport(
      "application/csp-report",
      legacy({ "document-uri": "not a url", "effective-directive": "img-src", "blocked-uri": "https:// not a url" })
    )!
    expect(bad).toMatchObject({ blocked: "unknown", documentPath: "unknown" })

    const [none] = parseCspReport("application/csp-report", legacy({}))!
    expect(none.blocked).toBe("unknown")
  })

  it("keeps only csp-violation reports with a body from the Reporting API", () => {
    const body = JSON.stringify([
      { type: "deprecation", body: { documentURL: "https://app.example/" } },
      { type: "csp-violation" },
      {
        type: "csp-violation",
        body: { documentURL: "https://app.example/rewind/s/tok?x=1", effectiveDirective: "script-src-elem", blockedURL: "https://evil.example/x.js" },
      },
    ])
    const violations = parseCspReport("application/reports+json", body)!
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ directive: "script-src-elem", blocked: "https://evil.example", disposition: "enforce" })
    expect(violations[0].documentPath).not.toContain("?")
  })
})
