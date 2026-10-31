/**
 * `/admin/inactivity`'s reads (admin only): the sweep's settings and who saved
 * them last, the newest runs, whether Tautulli and Redis are set up, and the
 * preview of whom a run would remove now (`lib/data/inactivity-preview.ts`).
 *
 * A run stores member ids, never names (`lib/inactivity/entries.ts`); the
 * names of the members whose removal failed are read here, in one query for
 * every run listed.
 *
 * @module lib/data/inactivity
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { getActiveService } from "@/lib/data/active-service"
import { getInactivityPreview, type InactivityPreview } from "@/lib/data/inactivity-preview"
import type { Prisma } from "@/lib/generated/prisma/client"
import { parseInactivityEntries } from "@/lib/inactivity/entries"
import { getInactivitySettings, type InactivitySettingsValues } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType } from "@/lib/security/audit-log"
import type { LastSaved } from "@/lib/settings/audit-meta"

/** The runs the page lists: as many as a run keeps (`KEPT_RUNS` in `lib/inactivity/run.ts`). */
const RUNS_SHOWN = 30

const RUN_SELECT = {
  id: true,
  startedAt: true,
  finishedAt: true,
  trigger: true,
  tautulliUsers: true,
  matched: true,
  qualified: true,
  removed: true,
  failed: true,
  blocked: true,
  error: true,
  entries: true,
} as const satisfies Prisma.InactivityRunSelect

type StoredRun = Prisma.InactivityRunGetPayload<{ select: typeof RUN_SELECT }>

/** One run, with the names of the members whose removal failed. */
export interface InactivityRunRow extends Omit<StoredRun, "entries"> {
  /** From the run's entries; "Removed user" when the member's row is gone. */
  failedMembers: string[]
}

export interface InactivityPageData {
  settings: InactivitySettingsValues
  /** The newest settings save, or null before the first one. */
  lastSaved: LastSaved | null
  /** Newest first. */
  runs: InactivityRunRow[]
  tautulliConfigured: boolean
  /** Without Redis the daily run is not scheduled; Run now still works. */
  redisConfigured: boolean
  preview: InactivityPreview
}

async function lastSaved(): Promise<LastSaved | null> {
  const row = await prisma.auditLog.findFirst({
    where: { type: AuditEventType.INACTIVITY_SETTINGS_CHANGED },
    orderBy: { createdAt: "desc" },
    select: { actorUserId: true, createdAt: true },
  })
  if (!row) return null
  const actor = await prisma.user.findUnique({ where: { id: row.actorUserId }, select: { name: true, email: true } })
  return { at: row.createdAt, by: actor?.name || actor?.email || "an admin" }
}

async function recentRuns(): Promise<InactivityRunRow[]> {
  const stored = await prisma.inactivityRun.findMany({ orderBy: { startedAt: "desc" }, take: RUNS_SHOWN, select: RUN_SELECT })
  const runs = stored.map(({ entries, ...run }) => ({
    run,
    failedIds: parseInactivityEntries(entries)
      .filter((entry) => entry.outcome === "failed")
      .map((entry) => entry.userId),
  }))
  const ids = [...new Set(runs.flatMap(({ failedIds }) => failedIds))]
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  const nameOf = new Map(users.map((user) => [user.id, user.name || user.email || "Unknown member"]))
  return runs.map(({ run, failedIds }) => ({ ...run, failedMembers: failedIds.map((id) => nameOf.get(id) ?? "Removed user") }))
}

/**
 * Everything the page shows, with the preview as of `now`.
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getInactivityPage(now: Date): Promise<InactivityPageData> {
  await assertAdmin()
  const settings = await getInactivitySettings()
  const [saved, runs, tautulli, preview] = await Promise.all([
    lastSaved(),
    recentRuns(),
    getActiveService("tautulli"),
    getInactivityPreview(settings.thresholdDays, now),
  ])
  return {
    settings,
    lastSaved: saved,
    runs,
    tautulliConfigured: tautulli !== null,
    redisConfigured: isRedisConfigured(),
    preview,
  }
}
