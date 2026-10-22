/**
 * "Last saved {date} by {name}" for each settings section (P10.20, SEC-55),
 * read from the persisted audit log rather than `Config.updatedAt`, so every
 * section shows its own last save and who made it.
 *
 * Each settings section reads the newest audit row whose `details.section`
 * is one of its audit sections:
 *
 * | Settings section | Audit `details.section` |
 * |---|---|
 * | Plex, Tautulli, Overseerr | `plex`, `tautulli`, `overseerr` |
 * | AI provider | `llm`, `llm.chat`, `llm.wrapped`, `llm.caps` |
 * | Discord | `discord` (`DISCORD_INTEGRATION_CONFIG_CHANGED`) |
 * | Stripe billing | `stripe`, `stripe.enabled` |
 * | Watchlist sync, Rewind | `watchlist`, `rewind` |
 * | Other integrations | `sonarr`, `radarr`, `jellyfin`, `jellyfin.login`, `prometheus` |
 * | System information | `appearance`, `timezone` (`SERVER_TIMEZONE_CHANGED`) |
 *
 * The lookups go out as one batched transaction, then one read of the actors'
 * names. Details are never returned, only the time and the name.
 *
 * @module lib/settings/audit-meta
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { AuditEventType } from "@/lib/security/audit-log"

const SECTIONS = {
  plex: ["plex"],
  tautulli: ["tautulli"],
  overseerr: ["overseerr"],
  ai: ["llm", "llm.chat", "llm.wrapped", "llm.caps"],
  discord: ["discord"],
  stripe: ["stripe", "stripe.enabled"],
  watchlist: ["watchlist"],
  rewind: ["rewind"],
  other: ["sonarr", "radarr", "jellyfin", "jellyfin.login", "prometheus"],
  system: ["appearance", "timezone"],
} as const satisfies Record<string, readonly string[]>

type SettingsAuditSection = keyof typeof SECTIONS

/** A section's last audited save. */
export interface LastSaved {
  at: Date
  by: string
}

export type SettingsAuditMeta = Record<SettingsAuditSection, LastSaved | null>

/** The audit types that record a settings save. */
const SAVE_TYPES = [AuditEventType.CONFIG_CHANGED, AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, AuditEventType.SERVER_TIMEZONE_CHANGED]

/** The newest save of every settings section, or null for a section never saved. */
export async function getSettingsAuditMeta(): Promise<SettingsAuditMeta> {
  const ids = Object.keys(SECTIONS) as SettingsAuditSection[]
  const rows = await prisma.$transaction(
    ids.map((id) =>
      prisma.auditLog.findFirst({
        where: {
          type: { in: SAVE_TYPES },
          OR: SECTIONS[id].map((section) => ({ details: { path: ["section"], equals: section } })),
        },
        orderBy: { createdAt: "desc" },
        select: { actorUserId: true, createdAt: true },
      })
    )
  )

  const actorIds = [...new Set(rows.flatMap((row) => (row ? [row.actorUserId] : [])))]
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : []
  const nameOf = new Map(actors.map((actor) => [actor.id, actor.name || actor.email || "an admin"]))

  return Object.fromEntries(
    ids.map((id, index) => {
      const row = rows[index]
      return [id, row ? { at: row.createdAt, by: nameOf.get(row.actorUserId) ?? "an admin" } : null]
    })
  ) as SettingsAuditMeta
}
