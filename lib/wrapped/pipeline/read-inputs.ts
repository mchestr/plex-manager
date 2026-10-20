/**
 * The member's plays and every source the stats read (design 9.2 step 3).
 *
 * Plays come from the batch's event cache, or else from a per-member
 * Tautulli read; excluded sections are dropped by the source and excluded
 * content ratings flagged by `getMemberEvents`, and hidden titles
 * (`RewindExclusion`) stay in totals through `StatsContext.hiddenKeys`. The
 * library listing comes from the batch cache: the pipeline never lists the
 * Plex library per member. Every upstream call goes through the Redis
 * semaphore. A failed history read is a retryable `UPSTREAM_ERROR`; a missing
 * optional source (lifetime, requests, library, aggregate) only makes its
 * pages ineligible (NFR-3).
 *
 * @module lib/wrapped/pipeline/read-inputs
 */

import "server-only"

import { createLogger } from "@/lib/utils/logger"
import { getBatchLibrary, getMemberEvents, getMemberLifetimeEvents } from "@/lib/wrapped/aggregate/batch-cache"
import { getMetadata } from "@/lib/wrapped/metadata-cache"
import { fetchMemberRequests, findOverseerrUser } from "@/lib/wrapped/sources/overseerr-requests"
import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import { createTautulliHistorySource } from "@/lib/wrapped/sources/tautulli-history"
import type { PlayEvent, SourceContext } from "@/lib/wrapped/sources/watch-history-source"
import type { MemberSources } from "@/lib/wrapped/stats/compute"
import { metadataLookup } from "@/lib/wrapped/stats/metadata"

import { RewindGenerationError } from "./generation-error"
import type { RewindContext } from "./load-context"

const logger = createLogger("REWIND_INPUTS")

export interface MemberInputs {
  events: PlayEvent[]
  sources: MemberSources
}

async function requestsOf(ctx: RewindContext, sourceCtx: SourceContext): Promise<RequestEvent[] | null> {
  if (!ctx.overseerr || !ctx.member.plexUserId) return null
  const user = await findOverseerrUser(ctx.overseerr, ctx.member.plexUserId, sourceCtx)
  if (!user.ok || user.data === null) return null
  const requests = await fetchMemberRequests(ctx.overseerr, user.data, ctx.window, new Map(), sourceCtx)
  if (!requests.ok) logger.warn("Overseerr requests failed; the Requests page is left out", { code: requests.code })
  return requests.ok ? requests.data : null
}

/** Reads the member's inputs for the context's batch. */
export async function readMemberInputs(ctx: RewindContext, sourceCtx: SourceContext): Promise<MemberInputs> {
  if (!ctx.tautulli || !ctx.member.plexUserId) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })
  const member = { userId: ctx.userId, plexUserId: ctx.member.plexUserId }
  const batch = { year: ctx.year, through: ctx.through }
  const source = createTautulliHistorySource({ config: ctx.tautulli, excludedSectionIds: ctx.config.excludedSectionIds })

  const events = await getMemberEvents(
    { ...batch, member, window: ctx.window, source, excludedContentRatings: ctx.config.excludedContentRatings },
    sourceCtx
  )
  if (!events.ok) throw new RewindGenerationError("UPSTREAM_ERROR", { retryable: true })

  const lifetime = await getMemberLifetimeEvents({ ...batch, member, source }, sourceCtx)
  if (!lifetime.ok) logger.warn("Lifetime history failed; member-since and last year are left out", { code: lifetime.code })
  const lifetimeEvents = lifetime.ok ? lifetime.data : null

  const [metadata, requests, library] = await Promise.all([
    getMetadata([...events.data, ...(lifetimeEvents ?? [])]),
    requestsOf(ctx, sourceCtx),
    getBatchLibrary(batch),
  ])
  return {
    events: events.data,
    sources: {
      lifetime: lifetimeEvents,
      metadata: metadataLookup(metadata),
      requests,
      aggregate: ctx.aggregate ? { userId: ctx.userId, aggregate: ctx.aggregate } : null,
      library,
      excludedContentRatings: ctx.config.excludedContentRatings,
    },
  }
}
