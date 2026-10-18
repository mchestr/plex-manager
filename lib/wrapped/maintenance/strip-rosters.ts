/**
 * The October 2026 privacy clean-up of stored Rewinds (P0.20, RWP-01, GAP-37).
 *
 * ## Overview
 *
 * Rewinds stored before P0.8 hold other members' names and watch time
 * (`statistics.leaderboards`), sometimes the owner's email as a name, LLM text
 * built from those rosters, a Tautulli error that listed every user, share
 * tokens no member asked for, and share visits with a reversible IP pseudonym.
 * `scripts/rewind-strip-leaderboards.ts` runs {@link stripRosters} to remove
 * them. It is a dry run unless `apply` is set, and running it twice is a
 * no-op the second time, without any marker.
 *
 * ## Steps
 *
 * 1. **Stored data.** `PlexWrapped` rows in id-cursor batches: delete
 *    `statistics.leaderboards`, replace a `userName` containing `@`, and
 *    replace the owner's email in every string value and in `summary`. Only
 *    changed rows are written, and only if nothing else wrote them meanwhile.
 * 2. **LLM text.** Null `prompt` and `response` on `LLMUsage` rows with no
 *    `chatConversationId` (Rewind runs, the playground, prompt tests).
 * 3. **Errors.** An `error` containing "Available users" becomes
 *    `{"code":"TAUTULLI_USER_NOT_FOUND"}`.
 * 4. **Tokens.** While legacy visits exist, null every `shareToken` that has no
 *    recorded visit.
 * 5. **Visits.** Delete the legacy visits (`ipAddress`, `userAgent` or
 *    `referer` set; every visit written before P0.8).
 *
 * Steps 4 and 5 share one transaction, step 4 first. New visits carry none of
 * the legacy fields, so once step 5 has run, step 4 never fires again.
 *
 * @module lib/wrapped/maintenance/strip-rosters
 */

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { toStoredError } from "@/lib/wrapped/generation-errors"
import { memberName } from "@/lib/wrapped/member-name"

/** Shown by admin pages in place of LLM text that step 2 removed. */
export const LLM_TEXT_REMOVED_NOTICE = "Text removed in the October 2026 privacy clean-up"

const BATCH_SIZE = 200
const LEGACY_ERROR_MARKER = "Available users"
const TRANSACTION_TIMEOUT_MS = 120_000

const LEGACY_VISIT = {
  OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }, { referer: { not: null } }],
} satisfies Prisma.WrappedShareVisitWhereInput

const UNVISITED_TOKEN = {
  shareToken: { not: null },
  shareVisits: { none: {} },
} satisfies Prisma.PlexWrappedWhereInput

export interface RewindOwner {
  name: string | null
  email: string | null
}

export type StrippedRewind = { status: "unchanged" } | { status: "changed"; data: string } | { status: "unparsable" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The name that replaces an email: the member's name, or "Viewer" as generation stores it. */
function replacementName(owner: RewindOwner): string {
  return memberName(owner) ?? "Viewer"
}

/** A function that replaces the owner's email in a string (any case), or null when there is none. */
function ownerEmailReplacer(owner: RewindOwner): ((text: string) => string) | null {
  const email = owner.email?.trim()
  if (!email || !email.includes("@")) return null
  const pattern = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
  const name = replacementName(owner)
  // A function, so `$&` or `$1` in a member's name is not read as a replacement pattern.
  return (text) => text.replace(pattern, () => name)
}

/** Replace every string value (not keys) inside a parsed JSON value in place; true when one changed. */
function replaceStrings(node: unknown, replace: (text: string) => string): boolean {
  let changed = false
  const visit = (value: unknown, set: (next: string) => void) => {
    if (typeof value === "string") {
      const next = replace(value)
      if (next !== value) {
        set(next)
        changed = true
      }
    } else if (replaceStrings(value, replace)) {
      changed = true
    }
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => visit(item, (next) => (node[index] = next)))
  } else if (isRecord(node)) {
    for (const [key, item] of Object.entries(node)) visit(item, (next) => (node[key] = next))
  }
  return changed
}

/**
 * Strip one stored `PlexWrapped.data` JSON string (v1 or v2).
 *
 * @example
 * ```ts
 * stripStoredRewind(
 *   '{"userName":"mike@example.com","statistics":{"leaderboards":{},"moviesWatched":3}}',
 *   { name: "Mike", email: "mike@example.com" }
 * )
 * // { status: "changed", data: '{"userName":"Mike","statistics":{"moviesWatched":3}}' }
 * ```
 */
export function stripStoredRewind(data: string, owner: RewindOwner): StrippedRewind {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return { status: "unparsable" }
  }
  if (!isRecord(parsed)) return { status: "unparsable" }

  let changed = false
  if (isRecord(parsed.statistics) && "leaderboards" in parsed.statistics) {
    delete parsed.statistics.leaderboards
    changed = true
  }
  if (typeof parsed.userName === "string" && parsed.userName.includes("@")) {
    parsed.userName = replacementName(owner)
    changed = true
  }
  const replaceEmail = ownerEmailReplacer(owner)
  if (replaceEmail && replaceStrings(parsed, replaceEmail)) changed = true

  return changed ? { status: "changed", data: JSON.stringify(parsed) } : { status: "unchanged" }
}

/** Replace the owner's email in the `PlexWrapped.summary` column. */
export function scrubOwnerEmail(text: string | null, owner: RewindOwner): string | null {
  const replaceEmail = ownerEmailReplacer(owner)
  return text === null || !replaceEmail ? text : replaceEmail(text)
}

/** Replace the RWP-02 roster error with P0.9's stored code; any other value is returned as is. */
export function stripLegacyError(error: string | null): string | null {
  return error?.includes(LEGACY_ERROR_MARKER) ? toStoredError("TAUTULLI_USER_NOT_FOUND") : error
}

export interface StepCounts {
  scanned: number
  changed: number
}

export interface StripRostersReport {
  apply: boolean
  /** `skipped`: changed rows another writer updated while the step ran; a rerun picks them up. */
  storedData: StepCounts & { unparsable: number; skipped: number }
  llmText: StepCounts
  errors: StepCounts
  tokens: StepCounts
  visits: StepCounts
}

async function stripStoredData(db: PrismaClient, apply: boolean): Promise<StripRostersReport["storedData"]> {
  const counts = { scanned: 0, changed: 0, unparsable: 0, skipped: 0 }
  let cursor: string | undefined
  for (;;) {
    const rows = await db.plexWrapped.findMany({
      where: cursor === undefined ? {} : { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, data: true, summary: true, updatedAt: true, user: { select: { name: true, email: true } } },
    })
    for (const row of rows) {
      counts.scanned++
      const stripped = stripStoredRewind(row.data, row.user)
      if (stripped.status === "unparsable") counts.unparsable++
      const summary = scrubOwnerEmail(row.summary, row.user)
      const update: { data?: string; summary?: string | null } = {}
      if (stripped.status === "changed") update.data = stripped.data
      if (summary !== row.summary) update.summary = summary
      if (Object.keys(update).length === 0) continue

      counts.changed++
      if (!apply) continue
      const { count } = await db.plexWrapped.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt },
        data: update,
      })
      if (count === 0) counts.skipped++
    }
    if (rows.length < BATCH_SIZE) return counts
    cursor = rows[rows.length - 1].id
  }
}

async function stripLlmText(db: PrismaClient, apply: boolean): Promise<StepCounts> {
  const withText = {
    chatConversationId: null,
    OR: [{ prompt: { not: null } }, { response: { not: null } }],
  } satisfies Prisma.LLMUsageWhereInput
  const scanned = await db.lLMUsage.count({ where: { chatConversationId: null } })
  const changed = apply
    ? (await db.lLMUsage.updateMany({ where: withText, data: { prompt: null, response: null } })).count
    : await db.lLMUsage.count({ where: withText })
  return { scanned, changed }
}

async function stripErrors(db: PrismaClient, apply: boolean): Promise<StepCounts> {
  const legacy = { error: { contains: LEGACY_ERROR_MARKER } } satisfies Prisma.PlexWrappedWhereInput
  const scanned = await db.plexWrapped.count({ where: { error: { not: null } } })
  const changed = apply
    ? (await db.plexWrapped.updateMany({ where: legacy, data: { error: toStoredError("TAUTULLI_USER_NOT_FOUND") } }))
        .count
    : await db.plexWrapped.count({ where: legacy })
  return { scanned, changed }
}

async function revokeTokensAndDeleteVisits(
  db: PrismaClient,
  apply: boolean
): Promise<Pick<StripRostersReport, "tokens" | "visits">> {
  const tokensScanned = await db.plexWrapped.count({ where: { shareToken: { not: null } } })
  const visitsScanned = await db.wrappedShareVisit.count()

  // Steps 4 then 5; on apply, one transaction.
  const tokensThenVisits = async (tx: Prisma.TransactionClient) => {
    const legacyVisits = await tx.wrappedShareVisit.count({ where: LEGACY_VISIT })
    if (legacyVisits === 0) return { revoked: 0, deleted: 0 }
    if (!apply) return { revoked: await tx.plexWrapped.count({ where: UNVISITED_TOKEN }), deleted: legacyVisits }
    const revoked = await tx.plexWrapped.updateMany({ where: UNVISITED_TOKEN, data: { shareToken: null } })
    const deleted = await tx.wrappedShareVisit.deleteMany({ where: LEGACY_VISIT })
    return { revoked: revoked.count, deleted: deleted.count }
  }
  const { revoked, deleted } = apply
    ? await db.$transaction(tokensThenVisits, { timeout: TRANSACTION_TIMEOUT_MS })
    : await tokensThenVisits(db)

  return {
    tokens: { scanned: tokensScanned, changed: revoked },
    visits: { scanned: visitsScanned, changed: deleted },
  }
}

/**
 * Run the five steps in order. With `apply: false` nothing is written and the
 * report holds what an apply would change.
 */
export async function stripRosters(db: PrismaClient, options: { apply: boolean }): Promise<StripRostersReport> {
  const { apply } = options
  const storedData = await stripStoredData(db, apply)
  const llmText = await stripLlmText(db, apply)
  const errors = await stripErrors(db, apply)
  const { tokens, visits } = await revokeTokensAndDeleteVisits(db, apply)
  return { apply, storedData, llmText, errors, tokens, visits }
}

/** The report as the lines the CLI prints. */
export function formatStripReport(report: StripRostersReport): string[] {
  const step = (label: string, counts: StepCounts, extra = "") =>
    `${label.padEnd(18)} scanned ${counts.scanned}, changed ${counts.changed}${extra}`
  const { storedData } = report
  return [
    report.apply ? "Rewind roster clean-up: applied." : "Rewind roster clean-up: dry run, nothing written (pass --apply to write).",
    step(
      "1. Stored data",
      storedData,
      `, unparsable ${storedData.unparsable}` + (report.apply ? `, skipped ${storedData.skipped}` : "")
    ),
    step("2. LLM text", report.llmText),
    step("3. Errors", report.errors),
    step("4. Share tokens", report.tokens),
    step("5. Legacy visits", report.visits),
  ]
}

export type StripArgs = { ok: true; apply: boolean } | { ok: false; help: boolean }

/** `--apply` writes; no arguments is a dry run; `--help` or anything else prints the usage. */
export function parseStripArgs(argv: readonly string[]): StripArgs {
  if (argv.length === 0) return { ok: true, apply: false }
  if (argv.length === 1 && argv[0] === "--apply") return { ok: true, apply: true }
  return { ok: false, help: argv.includes("--help") || argv.includes("-h") }
}
