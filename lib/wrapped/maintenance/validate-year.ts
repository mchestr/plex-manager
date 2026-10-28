/**
 * The read-only check of every stored Rewind of a year (P8.5).
 *
 * ## Overview
 *
 * `scripts/rewind-validate.ts` loads each eligible member's row and every
 * live share link, and this module decides, without any I/O, whether each
 * would render and share as stored. It runs against production after the
 * season generation (2026-12-02), and at any time after.
 *
 * ## Checks (each failure has its own code)
 *
 * | Code | Check |
 * |---|---|
 * | `NOT_COMPLETED` | an eligible member has no completed Rewind and was not skipped |
 * | `UNPARSABLE` / `NOT_V3` | `parseStoredRewind()` returns version 3 |
 * | `PAGE_SCHEMA` | every page passes `registry[type].schema`, so the viewer drops none |
 * | `FACTS_HASH_MISMATCH` | `factsHash` matches the stored facts |
 * | `SLOT_MISSING` | every selected slot has its text |
 * | `SLOT_TOO_LONG` | every slot renders within its `maxChars` with today's displays (grounding rule 7) |
 * | `SLOT_TOKEN` | every token is allowed, present and on a selected page (rule 5) |
 * | `SLOT_GROUNDING` | every slot passes the rest of `groundSlot` (a template is grounded as a template) |
 * | `SLOT_HASH_STALE` | `copyMeta.slotHashes` equal `slotDependencyHash()` |
 * | `SHARE_KEYS` / `SHARE_PROJECTION` | each live share's `toShareSafe()` output passes the strict allow-list |
 *
 * A text equal to the slot's template for the stored facts is grounded as a
 * template (window words allowed); every other text is model copy. The
 * report holds counts by code, wrapped and share ids, and skip reasons:
 * never a title, a name or any other stored value.
 *
 * @module lib/wrapped/maintenance/validate-year
 */

import { z } from "zod"

import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import { groundSlot } from "@/lib/wrapped/copy/grounding"
import { slotDependencyHash, slotsForPages } from "@/lib/wrapped/copy/slots"
import { copyLocals, slotTemplate } from "@/lib/wrapped/copy/templates"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { ShareSafeRewindV3 } from "@/lib/wrapped/data/share-safe-schema"
import { factsHash } from "@/lib/wrapped/facts/hash"
import { textSlots, wireText } from "@/lib/wrapped/pipeline/copy-draft"

const VALIDATION_CODES = [
  "NOT_COMPLETED", "UNPARSABLE", "NOT_V3", "PAGE_SCHEMA", "FACTS_HASH_MISMATCH", "SLOT_MISSING", "SLOT_TOO_LONG",
  "SLOT_TOKEN", "SLOT_GROUNDING", "SLOT_HASH_STALE", "SHARE_KEYS", "SHARE_PROJECTION",
] as const

type ValidationCode = (typeof VALIDATION_CODES)[number]

/** One eligible member: their Rewind row and their latest generation, either possibly missing. */
export interface MemberRow {
  userId: string
  wrapped: { id: string; status: string; data: string | null } | null
  latest: { status: string; code: string | null } | null
}

/** One live share link; `project` runs `toShareSafe()` and may throw. */
export interface ShareRow {
  shareId: string
  wrappedId: string
  project: () => unknown
}

export interface ValidateOptions {
  year: number
}

export interface YearReport {
  checked: number
  passed: number
  failures: Partial<Record<ValidationCode, number>>
  failing: Array<{ id: string; codes: ValidationCode[] }>
  skipped: Record<string, number>
  shares: { checked: number; failed: number }
}

const pageValid = (page: RewindDataV3["pages"][number]) => {
  const entry = (registry as Record<string, RegistryEntry | undefined>)[page.type]
  return entry ? entry.schema.safeParse(page.data).success : false
}

/** The copy checks of a full issue: every selected slot present, grounded and hashed as stored. */
function copyCodes(data: RewindDataV3, userId: string): ValidationCode[] {
  if (!data.copy) return []
  const codes: ValidationCode[] = []
  const selected = data.pages.map((page) => page.type)
  const locals = copyLocals({ year: data.year })
  for (const id of textSlots(selected)) {
    const text = wireText(data.copy, id)
    if (text === null) {
      codes.push("SLOT_MISSING")
      continue
    }
    const source = text === slotTemplate(id, { facts: data.facts, userId, locals }) ? "template" : "llm"
    const result = groundSlot(id, text, { facts: data.facts, selected, source, locals })
    if (!result.ok) codes.push(...result.issues.map((issue) => (issue.rule === 7 ? "SLOT_TOO_LONG" : issue.rule === 5 ? "SLOT_TOKEN" : "SLOT_GROUNDING")))
  }
  for (const slot of slotsForPages(selected)) {
    if (data.copyMeta.slotHashes[slot.id] !== slotDependencyHash(slot, data.facts)) codes.push("SLOT_HASH_STALE")
  }
  return codes
}

/**
 * Every code a completed row fails, without repeats; empty when it passes.
 * @internal
 */
export function validateStoredRow(row: NonNullable<MemberRow["wrapped"]> & { userId: string }): ValidationCode[] {
  const stored = parseStoredRewind(row.data)
  if (stored.version === "invalid") return ["UNPARSABLE"]
  if (stored.version !== 3) return ["NOT_V3"]
  const { data } = stored
  const codes: ValidationCode[] = []
  if (!data.pages.every(pageValid)) codes.push("PAGE_SCHEMA")
  if (factsHash(data.facts) !== data.factsHash) codes.push("FACTS_HASH_MISMATCH")
  codes.push(...copyCodes(data, row.userId))
  return [...new Set(codes)]
}

/**
 * The share's code, or null when its projection passes the strict allow-list.
 * @internal
 */
export function validateShare(share: ShareRow): ValidationCode | null {
  let projection: unknown
  try {
    projection = share.project()
  } catch (error) {
    return error instanceof z.ZodError ? "SHARE_KEYS" : "SHARE_PROJECTION"
  }
  return ShareSafeRewindV3.safeParse(projection).success ? null : "SHARE_KEYS"
}

/** Validates the year; see the module comment. */
export function validateYear(members: readonly MemberRow[], shares: readonly ShareRow[]): YearReport {
  const report: YearReport = { checked: 0, passed: 0, failures: {}, failing: [], skipped: {}, shares: { checked: 0, failed: 0 } }
  const fail = (id: string, codes: ValidationCode[]) => {
    report.failing.push({ id, codes })
    for (const code of codes) report.failures[code] = (report.failures[code] ?? 0) + 1
  }

  for (const member of members) {
    const { wrapped, latest } = member
    if (wrapped?.status !== "completed") {
      if (latest?.status === "skipped") {
        const reason = latest.code ?? "SKIPPED"
        report.skipped[reason] = (report.skipped[reason] ?? 0) + 1
      } else fail(wrapped?.id ?? member.userId, ["NOT_COMPLETED"])
      continue
    }
    report.checked++
    const codes = validateStoredRow({ ...wrapped, userId: member.userId })
    if (codes.length === 0) report.passed++
    else fail(wrapped.id, codes)
  }

  for (const share of shares) {
    report.shares.checked++
    const code = validateShare(share)
    if (!code) continue
    report.shares.failed++
    fail(share.shareId, [code])
  }
  return report
}

/** The printed report: counts by code and skip reason, and the failing ids. */
export function formatYearReport(report: YearReport, options: ValidateOptions): string[] {
  const total = Object.values(report.failures).reduce((sum, n) => sum + (n ?? 0), 0)
  const lines = [
    `Rewind ${options.year}: ${report.checked} checked, ${report.passed} passed, ${report.failing.length} failing.`,
    `Shares: ${report.shares.checked} checked, ${report.shares.failed} failed.`,
  ]
  if (total === 0) lines.push("Failures: none.")
  else {
    lines.push("Failures by code:")
    for (const code of VALIDATION_CODES) if (report.failures[code]) lines.push(`  ${code.padEnd(22)} ${report.failures[code]}`)
  }
  const reasons = Object.keys(report.skipped).sort()
  lines.push(reasons.length === 0 ? "Skipped: none." : "Skipped by reason:")
  for (const reason of reasons) lines.push(`  ${reason.padEnd(22)} ${report.skipped[reason]}`)
  for (const row of report.failing) lines.push(`  failing ${row.id}: ${row.codes.join(", ")}`)
  return lines
}
