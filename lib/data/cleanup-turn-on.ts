/**
 * The turn-on and Change mode page of `/admin/cleanup/rules/[id]/turn-on`
 * (UX 4.6, 12.4, TS 10.4, 10.5, E28). Admin only.
 *
 * It builds on `computeTurnOnReview()`, the review that `turnOnCleanupRule`
 * compares, so the page and the check cannot differ. It adds the posters,
 * the timeline with the budget pace, who sees it, the shared budget, the
 * dry runs and the 10 largest. It returns `revision`, `count`, `keysHash`
 * and `reviewedAt`, never the item keys.
 *
 * "Who sees it" counts members through `memberCleanupAccess()` (TS 12.7
 * item 7): the only upstream call of the admin loaders (plex.tv, cached for
 * 10 minutes). The 10 largest name requesters, so the read writes
 * `auditMemberListed("cleanup-requesters")`.
 *
 * @module lib/data/cleanup-turn-on
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { namesRequesters } from "@/lib/cleanup/preview/rows"
import { computeTurnOnReview } from "@/lib/cleanup/run/turn-on-review"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import { turnOnData } from "@/lib/cleanup/screens/turn-on/assemble"
import type { StoredTitle } from "@/lib/cleanup/screens/turn-on/rows"
import { membersWhoCanSee, ruleLibraries } from "@/lib/cleanup/screens/turn-on/who-sees"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"

type TurnOnMode = CleanupTurnOnData["mode"]

/** The app members, for the names of the sentence when there is no library data. */
const readMembers = async () =>
  (await prisma.user.findMany({ select: { id: true, plexUserId: true, name: true, accessEndedAt: true } }))
    .map(({ id, ...member }) => ({ userId: id, ...member }))

/**
 * The page data of a rule at `now`. Without `mode`, a Dry run rule and an
 * Automatic rule start with Review first, and a Review first rule starts
 * with Automatic (Change mode).
 *
 * @returns null for a rule that does not exist or whose stored definition does not parse (the page shows `notFound()`)
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error of `assertAdmin()`
 */
export async function getCleanupTurnOn(ruleId: string, mode?: TurnOnMode, now: Date = new Date()): Promise<CleanupTurnOnData | null> {
  const session = await assertAdmin()
  const [review, row, others, server] = await Promise.all([
    computeTurnOnReview(ruleId, mode ?? "reviewFirst", now),
    prisma.cleanupRule.findUnique({ where: { id: ruleId }, select: { stats: true } }),
    prisma.cleanupRule.findMany({ where: { mode: { not: "dryRun" }, id: { not: ruleId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getActiveService("plex"),
  ])
  if (!review) return null
  const { ctx, rule, set } = review
  const facts = ctx.snapshot?.header.facts ?? null
  const members = ctx.evaluation?.live.members ?? (await readMembers())
  const missing = set.flatMap((entry) => (entry.result ? [] : [entry.itemKey]))
  const storedRows = missing.length === 0 ? [] : await prisma.cleanupItem.findMany({ where: { itemKey: { in: missing } },
    select: { itemKey: true, title: true, seasonNumber: true, ratingKey: true } })
  const stored = new Map<string, StoredTitle>(storedRows.map(({ itemKey, ...title }) => [itemKey, title]))
  const sectionIds = ruleLibraries(rule.definition, facts?.libraries ?? []).map((l) => l.sectionId)
  const data = turnOnData({
    review,
    mode: mode ?? (rule.mode === "reviewFirst" ? "automatic" : "reviewFirst"),
    stats: parseRuleStats(row?.stats),
    sharedWith: others,
    membersWhoCanSee: await membersWhoCanSee({ server, members, users: facts?.users ?? null, sectionIds }),
    members,
    stored,
  })
  if (data.largest.some((r) => namesRequesters(r.requestedBy))) await auditMemberListed("cleanup-requesters", session.user.id, { ruleId })
  return data
}
