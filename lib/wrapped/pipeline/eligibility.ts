/**
 * Whether a member's v3 Rewind may be generated (design 9.2 step 2).
 *
 * The checks run in this order, and the first that fails is the run's typed
 * `skipped` reason:
 *
 * | Reason | When |
 * |---|---|
 * | `REDIS_UNAVAILABLE` | `checkRewindInfra()` fails (FR-50) |
 * | `REWIND_DISABLED` | `Config.rewindEnabled` is off |
 * | `NOT_IN_AUDIENCE` | the audience is admins and the member is not one |
 * | `NO_PLEX_IDENTITY` | the member has no `plexUserId` |
 * | `TAUTULLI_USER_NOT_FOUND` | Tautulli's user list lacks them (FR-48, P0.9's lookup) |
 * | `MANAGED_ACCOUNT` | a managed Plex Home account, unless `rewindIncludeManagedUsers` |
 * | `NOT_ENTITLED` | Stripe is on and the member has no active access (FR-51) |
 * | `JOINED_LATE` | the first lifetime play, else the account, is on or after 1 October (design 4.5) |
 *
 * `JOINED_LATE` needs the member's lifetime plays, so the pipeline runs
 * {@link checkJoinedLate} once it has read them, before any copy step: a late
 * joiner never reaches a model.
 *
 * Admin regenerations (`kind: 'admin'`) bypass the two flags, never the
 * identity or entitlement checks. A Tautulli outage is not a reason: it
 * throws a retryable `UPSTREAM_ERROR`, and a missing Tautulli throws
 * `NOT_CONFIGURED`.
 *
 * @module lib/wrapped/pipeline/eligibility
 */

import type { FindTautulliUserResult, TautulliUserIdentity } from "@/lib/connections/tautulli"
import type { AccessLevel } from "@/lib/access"
import type { RewindInfraStatus } from "@/lib/queue/rewind-infra"
import type { RewindGenerationKind } from "@/lib/rewind/enqueue-generation"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"
import { isLateJoiner, type JoinedMember } from "@/lib/wrapped/pipeline/late-joiner"

export type SkipReason =
  | "REDIS_UNAVAILABLE"
  | "REWIND_DISABLED"
  | "NOT_IN_AUDIENCE"
  | "NO_PLEX_IDENTITY"
  | "TAUTULLI_USER_NOT_FOUND"
  | "MANAGED_ACCOUNT"
  | "NOT_ENTITLED"
  | "JOINED_LATE"

export type EligibilityResult = { ok: true } | { ok: false; reason: SkipReason }

export interface EligibilityInput {
  kind: RewindGenerationKind
  member: { userId: string; plexUserId: string | null; isAdmin: boolean }
  config: { rewindEnabled: boolean; rewindAudience: string; rewindIncludeManagedUsers: boolean; stripeEnabled: boolean }
  tautulli: { url: string; apiKey: string } | null
}

export interface EligibilityDeps {
  checkInfra: () => Promise<RewindInfraStatus>
  findTautulliUser: (config: { url: string; apiKey: string }, identity: TautulliUserIdentity) => Promise<FindTautulliUserResult>
  accessLevel: (userId: string) => Promise<AccessLevel>
}

const skip = (reason: SkipReason): EligibilityResult => ({ ok: false, reason })

/** Runs the checks in the module's order; see the table. */
export async function checkEligibility(input: EligibilityInput, deps: EligibilityDeps): Promise<EligibilityResult> {
  const { kind, member, config } = input
  if (!(await deps.checkInfra()).ok) return skip("REDIS_UNAVAILABLE")

  if (kind !== "admin") {
    if (!config.rewindEnabled) return skip("REWIND_DISABLED")
    if (config.rewindAudience !== "all" && !member.isAdmin) return skip("NOT_IN_AUDIENCE")
  }

  if (!member.plexUserId) return skip("NO_PLEX_IDENTITY")
  if (!input.tautulli) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })
  const lookup = await deps.findTautulliUser(input.tautulli, { plexUserId: member.plexUserId })
  if (!lookup.ok) {
    if (lookup.code === "TAUTULLI_ERROR") throw new RewindGenerationError("UPSTREAM_ERROR", { retryable: true })
    return skip("TAUTULLI_USER_NOT_FOUND")
  }
  if (lookup.user.is_restricted === 1 && !config.rewindIncludeManagedUsers) return skip("MANAGED_ACCOUNT")

  if (config.stripeEnabled && (await deps.accessLevel(member.userId)) !== "full") return skip("NOT_ENTITLED")
  return { ok: true }
}

/** The `JOINED_LATE` check, in the member's Rewind zone. */
export function checkJoinedLate(member: JoinedMember, year: number, zone: string): EligibilityResult {
  return isLateJoiner(member, year, zone) ? skip("JOINED_LATE") : { ok: true }
}
