/**
 * Parses the CSP violation reports browsers send to `/api/csp-report` (P11.20).
 *
 * Two formats arrive:
 *
 * - `application/csp-report`, from `report-uri`: one `{ "csp-report": { ... } }`
 *   object with kebab-case keys.
 * - `application/reports+json`, from `report-to` (Reporting API): an array of
 *   `{ type, body }` reports with camelCase keys; only `csp-violation` ones count.
 *
 * Each becomes a {@link CspViolation} that is safe to log: the directive, the
 * blocked origin (or a keyword such as `inline` or `eval`) and the document's
 * path with share and invite tokens masked. Query strings never leave.
 *
 * @module lib/security/csp-report
 */

import { z } from "zod"

import { sanitizeText } from "@/lib/utils/log-redaction"

const CSP_REPORT_TYPES = ["application/csp-report", "application/reports+json"] as const
export type CspReportType = (typeof CSP_REPORT_TYPES)[number]

export interface CspViolation {
  directive: string
  blocked: string
  documentPath: string
  disposition: string
}

const field = z.string().max(2048).optional()

const legacySchema = z.object({
  "csp-report": z.object({
    "document-uri": field,
    "violated-directive": field,
    "effective-directive": field,
    "blocked-uri": field,
    disposition: field,
  }),
})

const reportingSchema = z
  .array(
    z.object({
      type: z.string(),
      body: z
        .object({ documentURL: field, effectiveDirective: field, blockedURL: field, disposition: field })
        .optional(),
    })
  )
  .max(50)

/** The `Content-Type` without parameters, when it is one of {@link CSP_REPORT_TYPES}. */
export function cspReportType(contentType: string | null): CspReportType | null {
  const type = contentType?.split(";")[0].trim().toLowerCase()
  return CSP_REPORT_TYPES.find((known) => known === type) ?? null
}

const KEYWORD = /^[a-z-]{1,32}$/

/** An origin for a URL, the keyword for `inline`, `eval` and the like, else `unknown`. */
function blockedSource(value: string | undefined): string {
  if (!value) return "unknown"
  if (KEYWORD.test(value)) return value
  try {
    const url = new URL(value)
    return url.origin === "null" ? url.protocol.replace(":", "") : url.origin
  } catch {
    return "unknown"
  }
}

function documentPath(value: string | undefined): string {
  try {
    return value ? sanitizeText(new URL(value).pathname) : "unknown"
  } catch {
    return "unknown"
  }
}

function violation(documentUrl?: string, directive?: string, blocked?: string, disposition?: string): CspViolation {
  return {
    directive: directive?.split(/\s/)[0] || "unknown",
    blocked: blockedSource(blocked),
    documentPath: documentPath(documentUrl),
    disposition: disposition === "report" ? "report" : "enforce",
  }
}

/**
 * The violations in a report body, or `null` when it is not valid JSON of the
 * given type.
 *
 * @example
 * ```ts
 * parseCspReport("application/csp-report", JSON.stringify({
 *   "csp-report": { "document-uri": "https://app.example/rewind/2026?x=1", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js" },
 * }))
 * // [{ directive: "script-src-elem", blocked: "https://evil.example", documentPath: "/rewind/2026", disposition: "enforce" }]
 * ```
 */
export function parseCspReport(type: CspReportType, text: string): CspViolation[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (type === "application/csp-report") {
    const parsed = legacySchema.safeParse(json)
    if (!parsed.success) return null
    const report = parsed.data["csp-report"]
    return [
      violation(report["document-uri"], report["effective-directive"] ?? report["violated-directive"], report["blocked-uri"], report.disposition),
    ]
  }
  const parsed = reportingSchema.safeParse(json)
  if (!parsed.success) return null
  return parsed.data
    .filter((report) => report.type === "csp-violation" && report.body)
    .map(({ body }) => violation(body?.documentURL, body?.effectiveDirective, body?.blockedURL, body?.disposition))
}
