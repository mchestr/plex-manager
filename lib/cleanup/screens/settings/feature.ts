/**
 * The page header data that every media cleanup tab reads (UX 4.1.4, 12.3):
 * the feature switch and the pause with who paused, whether the job queue
 * is set up, the library data header, and the services that are set up.
 * Server-only: it reads the settings row's admin id and the service rows.
 *
 * "Set up" means an active service row exists (`getActiveService`), so a
 * field, a recipe or a protection names a missing service before the first
 * library read too ("Set up Sonarr to use this", "Needs Sonarr").
 *
 * @module lib/cleanup/screens/settings/feature
 */

import "server-only"

import { isClaimHeld } from "@/lib/cleanup/claims"
import type { CleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CompleteHeader } from "@/lib/cleanup/snapshot/cache"
import type { CleanupFeatureState, CleanupSnapshotState } from "@/lib/cleanup/types/screens"
import { getActiveService } from "@/lib/data/active-service"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"
import { SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

/** The words of a pausing admin whose user row is gone. */
export const UNKNOWN_ADMIN = "An admin"

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null)

/**
 * The feature switch and the pause as the tabs read them. `pausedBy` names
 * the admin, and reads "you" for the viewer (`isYou`).
 */
export async function featureState(settings: CleanupSettingsRow, viewerId: string): Promise<CleanupFeatureState> {
  const pausedById = settings.pausedAt ? settings.pausedBy : null
  const admin = pausedById ? await prisma.user.findUnique({ where: { id: pausedById }, select: { name: true } }) : null
  return {
    enabled: settings.enabled,
    enabledAt: iso(settings.enabledAt),
    pausedAt: iso(settings.pausedAt),
    pausedBy: pausedById ? { id: pausedById, name: admin?.name ?? UNKNOWN_ADMIN, isYou: pausedById === viewerId } : null,
    redis: isRedisConfigured(),
  }
}

/** Whether a library read holds its claim at `now`: the source line shows the reading spinner. */
export const isReading = (settings: Pick<CleanupSettingsRow, "readClaimAt">, now: Date): boolean => isClaimHeld(settings.readClaimAt, now)

/** The library data header: the newest complete snapshot, or null fields before the first one. */
export function snapshotState(header: CompleteHeader | null, reading: boolean): CleanupSnapshotState {
  return { id: header?.id ?? null, takenAt: header?.facts.takenAt ?? null, finishedAt: iso(header?.finishedAt ?? null), reading }
}

/** The services with an active row, in `SERVICES` order. */
export async function setUpServices(): Promise<ReadonlySet<Service>> {
  const rows = await Promise.all(SERVICES.map((service) => getActiveService(service)))
  return new Set(SERVICES.filter((_, i) => rows[i] !== null))
}
