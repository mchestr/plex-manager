/**
 * A member's own swap of the copy and fix of the Plex match, decided when
 * the sheet opens and again when the report is sent (docs/problem-reports.md,
 * "Members' swaps"). The rules are pure (`./gate.ts`,
 * `./member-swap-words.ts`); this reads their facts.
 *
 * - **The sheet** (`memberFixesFor`) gets the gate's decision for the title,
 *   with its dates in words, while members' swaps are On. In Dry run and Off
 *   the member sees the server admin's line.
 * - **The report** decides again (`decideSwapForMember`). On, a swap runs
 *   only when the member chose Swap the copy, so a swap is never spent
 *   without them seeing what it costs; a refusal goes to the server admin
 *   with why, whatever the member pressed. In Dry run it runs on what the
 *   member described, since a dry run spends nothing and touches no file.
 * - **A different title playing** (`decideMatchForMember`): with members'
 *   swaps on, Plex's match is checked (`checkMatch`). On, a match that
 *   differs is fixed on its own; in Dry run, and when the match agrees or
 *   can't be told, the server admin hears what the check found. No swap
 *   limit or "Swaps need approval" applies: a match changes no file, and
 *   the hourly cap on Plex changes counts it.
 *
 * A member played the title recently when Tautulli has their play of it in
 * the last 30 days, or they're streaming it now.
 *
 * @module lib/problem-reports/member-swap
 */

import "server-only"

import type { PlexItemMetadata } from "@/lib/connections/plex"
import type { PlexServerConfig } from "@/lib/connections/plex-config"
import { isPlexItemPlaying } from "@/lib/connections/plex-file-state"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import type { Evidence, LastPlay } from "@/lib/problem-reports/evidence"
import { decideSwap, PLAYED_WITHIN_MS, type SwapFacts } from "@/lib/problem-reports/gate"
import { checkMatch } from "@/lib/problem-reports/match"
import { swapFits, type SwapOffer } from "@/lib/problem-reports/member-swap-words"
import { getSwapSettings, type SwapSettings } from "@/lib/problem-reports/settings"
import { readSwapLedger } from "@/lib/problem-reports/swap-ledger"
import type { ProblemCode } from "@/lib/problem-reports/taxonomy"
import { titleKeyOf } from "@/lib/problem-reports/title"
import type { DeviceAnswer, ToAdminReason } from "@/lib/validations/problem-reports"

/** The member's title, as `readMemberItem` found it in their libraries. */
interface MemberTitle {
  userId: string
  item: PlexItemMetadata
  server: PlexServerConfig
  lastPlay: LastPlay | null
}

type Decided = { startsFix: true; dryRun: boolean } | { startsFix: false; reason: ToAdminReason } | null

/** A swap acts on one file: a movie's with Radarr, an episode's with Sonarr. */
async function fileService(item: PlexItemMetadata): Promise<boolean> {
  if (item.type !== "movie" && item.type !== "episode") return false
  return (await getActiveService(item.type === "movie" ? "radarr" : "sonarr")) !== null
}

async function playedRecently(title: MemberTitle, viewer: { plexUserId: string | null; isOwner: boolean }, now: Date): Promise<boolean> {
  if (title.lastPlay && now.getTime() - new Date(title.lastPlay.at).getTime() < PLAYED_WITHIN_MS) return true
  if (!viewer.plexUserId) return false
  return (await isPlexItemPlaying(title.server, title.item.ratingKey, { plexUserId: viewer.plexUserId, isOwner: viewer.isOwner })) === true
}

async function readSwapFacts(title: MemberTitle, settings: SwapSettings, now: Date): Promise<SwapFacts> {
  const member = await prisma.user.findUnique({ where: { id: title.userId }, select: { swapsNeedApproval: true, plexUserId: true } })
  const ledger = await readSwapLedger(prisma, { reporterId: title.userId, titleKey: titleKeyOf(title.item), cooldownDays: settings.titleCooldownDays }, now)
  const plexUserId = member?.plexUserId ?? null
  return {
    mode: settings.automatic,
    limits: settings,
    ledger,
    breakerTripped: settings.breakerTrippedAt !== null,
    needsApproval: member?.swapsNeedApproval ?? true,
    playedRecently: await playedRecently(title, { plexUserId, isOwner: plexUserId !== null && plexUserId === title.server.adminPlexUserId }, now),
  }
}

/** What the sheet offers the member for this title: the gate's decision on a swap, and whether a match is fixed on its own. */
export async function memberFixesFor(title: MemberTitle, formatDay: (day: Date) => string, now: Date): Promise<{ swap: SwapOffer | null; matchFixes: boolean }> {
  const settings = await getSwapSettings()
  if (settings.automatic !== "ON") return { swap: null, matchFixes: false }
  if (!(await fileService(title.item))) return { swap: null, matchFixes: true }
  const decided = decideSwap(await readSwapFacts(title, settings, now), now)
  const day = (date: Date | null) => (date ? formatDay(date) : null)
  const swap: SwapOffer = decided.ok
    ? { ok: true, left: decided.allowance.left, of: decided.allowance.of, nextBack: day(decided.allowance.nextBack) }
    : { ok: false, reason: decided.reason, until: day(decided.until) }
  return { swap, matchFixes: true }
}

/** Whether a member's swap problem starts Swap the copy, or goes to the server admin with why; `null` leaves the report as it was. */
export async function decideSwapForMember(
  title: Omit<MemberTitle, "lastPlay"> & { problem: ProblemCode; device?: DeviceAnswer; evidence: Evidence; chose: boolean },
  now: Date
): Promise<Decided> {
  const settings = await getSwapSettings()
  if (settings.automatic === "OFF" || !(await fileService(title.item))) return null
  const fits = swapFits(title.problem, { device: title.device, playedToEnd: title.evidence.playedToEnd, transcoded: title.evidence.lastPlay?.transcoded === true })
  if (fits === "PLAYED_TO_END") return { startsFix: false, reason: "PLAYED_TO_END" }
  if (fits !== "SWAP") return null
  const facts = await readSwapFacts({ ...title, lastPlay: title.evidence.lastPlay }, settings, now)
  const decided = decideSwap(facts, now)
  // Members hear "paused" either way; the server admin hears which
  if (!decided.ok) return { startsFix: false, reason: decided.reason === "PAUSED" && facts.breakerTripped ? "BREAKER" : decided.reason }
  // On, a swap is spent only when the member chose it, having seen what it costs
  return settings.automatic === "ON" && !title.chose ? null : { startsFix: true, dryRun: decided.dryRun }
}

/** Whether a member's "A different title plays" starts Fix the Plex match, or goes to the server admin with what the check found. */
export async function decideMatchForMember(server: PlexServerConfig, item: PlexItemMetadata): Promise<{ startsFix: true } | { startsFix: false; reason: ToAdminReason } | null> {
  const settings = await getSwapSettings()
  if (settings.automatic === "OFF") return null
  const check = await checkMatch(server, item.ratingKey)
  if (check.verdict === "UNKNOWN") return { startsFix: false, reason: check.reason }
  if (check.verdict === "AGREES") return { startsFix: false, reason: "IDS_AGREE" }
  return settings.automatic === "ON" ? { startsFix: true } : { startsFix: false, reason: "MISMATCH" }
}
