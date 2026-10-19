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
 *    replace the owner's email, and a name that is itself an address, in
 *    every string value and in `summary`. Only changed rows are written, and
 *    only if nothing else wrote them meanwhile.
 * 2. **LLM text.** Null `prompt` and `response` on `LLMUsage` rows with no
 *    `chatConversationId` (Rewind runs, the playground, prompt tests).
 * 3. **Errors.** An `error` containing "Available users" becomes
 *    `{"code":"TAUTULLI_USER_NOT_FOUND"}`.
 * 4. **Tokens.** While legacy visits exist, null every `shareToken` that has
 *    no recorded visit on a Rewind last written before `optInSince`, when the
 *    release that made sharing opt-in (P0.19) went live. Turning a link on
 *    writes the row, so a link a member chose after that is kept even before
 *    its first visit.
 * 5. **Visits.** Clear `ipAddress`, `userAgent` and `referer` on the legacy
 *    visits (every visit written before P0.8). The rows stay, as P0.8 writes
 *    them, so the admin visit counts are kept and a later run still sees
 *    those links as visited.
 *
 * Steps 4 and 5 run first, in one transaction, step 4 first: the writes of
 * steps 1 and 3 move `updatedAt` past the cutoff, which would otherwise save
 * an auto-minted token. New visits carry none of the legacy fields, so once
 * step 5 has run, step 4 never fires again.
 *
 * @module lib/wrapped/maintenance/strip-rosters
 */

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client"
import { toStoredError } from "@/lib/wrapped/generation-errors"
import { memberName } from "@/lib/wrapped/member-name"

const BATCH_SIZE = 200
const LEGACY_ERROR_MARKER = "Available users"
const TRANSACTION_TIMEOUT_MS = 120_000

/** One `@` with text and no spaces on either side. */
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+$/
/** A whole address only: no address character before it, and no domain character or further `.label` after it. */
const ADDRESS_START = "(?<![A-Za-z0-9._%+-])"
const ADDRESS_END = "(?![A-Za-z0-9-]|\\.[A-Za-z0-9])"

const LEGACY_VISIT = {
  OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }, { referer: { not: null } }],
} satisfies Prisma.WrappedShareVisitWhereInput

interface RewindOwner {
  name: string | null
  email: string | null
}

type StrippedRewind = { status: "unchanged" } | { status: "changed"; data: string } | { status: "unparsable" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The name that replaces an email: the member's name, or "Viewer" as generation stores it. */
function replacementName(owner: RewindOwner): string {
  return memberName(owner) ?? "Viewer"
}

/**
 * A function that replaces the owner's addresses in a string, or null when
 * there are none. The addresses are `User.email` and a `User.name` that is
 * itself an address (a Plex username), because pre-P0.13 prompts used
 * `name || email`. They match in any case, and only as whole addresses.
 */
function ownerEmailReplacer(owner: RewindOwner): ((text: string) => string) | null {
  const addresses = [owner.email, owner.name]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => value !== undefined && ADDRESS_SHAPE.test(value))
  if (addresses.length === 0) return null
  const alternatives = [...new Set(addresses)]
    .sort((a, b) => b.length - a.length)
    .map((address) => address.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = new RegExp(`${ADDRESS_START}(?:${alternatives.join("|")})${ADDRESS_END}`, "gi")
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
 *
 * @internal
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

/**
 * Replace the owner's addresses in the `PlexWrapped.summary` column.
 *
 * @internal
 */
export function scrubOwnerEmail(text: string | null, owner: RewindOwner): string | null {
  const replaceEmail = ownerEmailReplacer(owner)
  return text === null || !replaceEmail ? text : replaceEmail(text)
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
  /** `scanned`: tokens on Rewinds last written before `optInSince` (every token without it). */
  tokens: StepCounts
  visits: StepCounts
}

/**
 * `optInSince` is when the release that made sharing opt-in (P0.19) went
 * live. An apply needs it; a dry run without it counts every unvisited token.
 */
export type StripRostersOptions = { apply: true; optInSince: Date } | { apply: false; optInSince: Date | null }

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

async function revokeTokensAndScrubVisits(
  db: PrismaClient,
  { apply, optInSince }: StripRostersOptions
): Promise<Pick<StripRostersReport, "tokens" | "visits">> {
  const preOptInToken = {
    shareToken: { not: null },
    ...(optInSince === null ? {} : { updatedAt: { lt: optInSince } }),
  } satisfies Prisma.PlexWrappedWhereInput
  const unvisitedToken = { ...preOptInToken, shareVisits: { none: {} } } satisfies Prisma.PlexWrappedWhereInput
  const tokensScanned = await db.plexWrapped.count({ where: preOptInToken })
  const visitsScanned = await db.wrappedShareVisit.count()

  // Steps 4 then 5; on apply, one transaction.
  const tokensThenVisits = async (tx: Prisma.TransactionClient) => {
    const legacyVisits = await tx.wrappedShareVisit.count({ where: LEGACY_VISIT })
    if (legacyVisits === 0) return { revoked: 0, scrubbed: 0 }
    if (!apply) return { revoked: await tx.plexWrapped.count({ where: unvisitedToken }), scrubbed: legacyVisits }
    const revoked = await tx.plexWrapped.updateMany({ where: unvisitedToken, data: { shareToken: null } })
    const scrubbed = await tx.wrappedShareVisit.updateMany({
      where: LEGACY_VISIT,
      data: { ipAddress: null, userAgent: null, referer: null },
    })
    return { revoked: revoked.count, scrubbed: scrubbed.count }
  }
  const { revoked, scrubbed } = apply
    ? await db.$transaction(tokensThenVisits, { timeout: TRANSACTION_TIMEOUT_MS })
    : await tokensThenVisits(db)

  return {
    tokens: { scanned: tokensScanned, changed: revoked },
    visits: { scanned: visitsScanned, changed: scrubbed },
  }
}

/**
 * Run the five steps, 4 and 5 first (see the module overview). With
 * `apply: false` nothing is written and the report holds what an apply would
 * change.
 */
export async function stripRosters(db: PrismaClient, options: StripRostersOptions): Promise<StripRostersReport> {
  const { tokens, visits } = await revokeTokensAndScrubVisits(db, options)
  const storedData = await stripStoredData(db, options.apply)
  const llmText = await stripLlmText(db, options.apply)
  const errors = await stripErrors(db, options.apply)
  return { apply: options.apply, storedData, llmText, errors, tokens, visits }
}
