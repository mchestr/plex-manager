/**
 * Connection health for the settings page (P10.19) and the admin Overview
 * (P10.8): one `ConnectionStatus` and a code per service, never an error message.
 *
 * ## Overview
 *
 * `getConnectionHealth()` runs the existing testers in `lib/connections/*`
 * in parallel for every active service row, each cut off at 5 s
 * ({@link PROBE_TIMEOUT_MS}), and caches the result for 5 minutes under the
 * tag `connection-health`, so a page that polls never runs a live upstream
 * test more than once per window. `recheckConnections()`
 * (`actions/admin/connection-health.ts`) updates the tag to re-check.
 *
 * | Service | Status |
 * |---|---|
 * | No active row | `notConfigured` |
 * | Tester succeeds | `ok` |
 * | Tester fails, throws or times out | `unreachable`, with `TIMEOUT`, `UNAUTHORIZED`, `NOT_FOUND` or `UNREACHABLE` |
 * | AI with `Config.llmDisabled` on | `degraded` ("Template copy", UI-31) |
 * | AI with a provider row | `ok` (no billed test call) |
 *
 * `getSettingsHealth()` adds the settings page's feature sections to the
 * cached service checks. Those read local state on every call, so turning
 * AI features off shows at once:
 *
 * | Section | Status |
 * |---|---|
 * | AI | `degraded` with `llmDisabled`, else the cached check |
 * | Discord | the worst of its enabled rows (`discordStatus`); `disabled` with both off |
 * | Stripe | `getStripeConfig()`: `disabled`, `incomplete` while a prerequisite is missing, else `ok` |
 * | Watchlist sync | `disabled`, else Overseerr's check (`incomplete` without Overseerr) |
 * | Rewind | `checkRewindInfra()`, then Tautulli's check |
 *
 * @module lib/settings/connection-health
 */

import "server-only"

import { unstable_cache } from "next/cache"

import { getStripeConfig } from "@/actions/admin/admin-config"
import { testJellyfinConnection } from "@/lib/connections/jellyfin-connection"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { testPlexConnection } from "@/lib/connections/plex-connection"
import { testPrometheusConnection } from "@/lib/connections/prometheus"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { CONNECTION_HEALTH_TAG, worstStatus, type HealthCode, type SectionHealth, type SettingsHealth } from "@/lib/settings/connection-status"
import { discordStatus, type ConnectionStatus } from "@/lib/ui/status"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CONNECTION_HEALTH")

/** A tester that has not answered by now counts as `unreachable` with `TIMEOUT` (P2.3's budget). @internal */
export const PROBE_TIMEOUT_MS = 5000

type ConnectionId = "plex" | "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr" | "prometheus" | "ai"

interface ConnectionHealthEntry {
  id: ConnectionId
  label: string
  status: ConnectionStatus
  /** Why it is not `ok`; never the tester's message. */
  code: HealthCode | null
}

export interface ConnectionHealth {
  /** When the testers ran, as an ISO string (the cache serialises it). */
  checkedAt: string
  connections: ConnectionHealthEntry[]
}

type Tester = () => Promise<{ success: boolean; error?: string }>
type Probe = Pick<ConnectionHealthEntry, "status" | "code">

/** Classifies a tester's fixed message into a code; the message itself stops here. */
function failureCode(error: string | undefined): HealthCode {
  if (!error) return "UNREACHABLE"
  if (/timeout/i.test(error)) return "TIMEOUT"
  if (/invalid|privilege|unauthori/i.test(error)) return "UNAUTHORIZED"
  if (/not found/i.test(error)) return "NOT_FOUND"
  return "UNREACHABLE"
}

/** `ok`, or `unreachable` with a code; a thrown tester is logged without reaching the result. */
async function probe(id: ConnectionId, test: Tester): Promise<Probe> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<Probe>((resolve) => {
    timer = setTimeout(() => resolve({ status: "unreachable", code: "TIMEOUT" }), PROBE_TIMEOUT_MS)
  })
  const run = test().then(
    (result): Probe =>
      result.success ? { status: "ok", code: null } : { status: "unreachable", code: failureCode(result.error) },
    (error: unknown): Probe => {
      logger.warn("Connection test threw", { id, error })
      return { status: "unreachable", code: "UNREACHABLE" }
    }
  )
  try {
    return await Promise.race([run, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const SERVICE = { where: { isActive: true }, select: { name: true, url: true, publicUrl: true } } as const

/** Runs every tester now, without the cache. @internal */
export async function checkConnections(now: Date = new Date()): Promise<ConnectionHealth> {
  const [plex, jellyfin, tautulli, overseerr, sonarr, radarr, prometheus, config, llmProviders] = await Promise.all([
    prisma.plexServer.findFirst({ ...SERVICE, select: { ...SERVICE.select, token: true } }),
    prisma.jellyfinServer.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.tautulli.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.overseerr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.sonarr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.radarr.findFirst({ ...SERVICE, select: { ...SERVICE.select, apiKey: true } }),
    prisma.prometheus.findFirst({ where: { isActive: true }, select: { name: true, url: true, query: true } }),
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true } }),
    prisma.lLMProvider.count({ where: { isActive: true } }),
  ])
  const publicUrl = (row: { publicUrl: string | null }) => row.publicUrl ?? undefined

  const tests: [ConnectionId, string, Tester | null][] = [
    ["plex", "Plex", plex && (() => testPlexConnection({ ...plex, publicUrl: publicUrl(plex) }))],
    ["jellyfin", "Jellyfin", jellyfin && (() => testJellyfinConnection({ ...jellyfin, publicUrl: publicUrl(jellyfin) }))],
    ["tautulli", "Tautulli", tautulli && (() => testTautulliConnection(tautulli))],
    ["overseerr", "Overseerr", overseerr && (() => testOverseerrConnection(overseerr))],
    ["sonarr", "Sonarr", sonarr && (() => testSonarrConnection({ ...sonarr, publicUrl: publicUrl(sonarr) }))],
    ["radarr", "Radarr", radarr && (() => testRadarrConnection({ ...radarr, publicUrl: publicUrl(radarr) }))],
    ["prometheus", "Prometheus", prometheus && (() => testPrometheusConnection(prometheus))],
  ]
  const services = await Promise.all(
    tests.map(
      async ([id, label, test]): Promise<ConnectionHealthEntry> => ({
        id,
        label,
        ...(test ? await probe(id, test) : { status: "notConfigured", code: null }),
      })
    )
  )
  const ai: Probe = config?.llmDisabled
    ? { status: "degraded", code: "LLM_DISABLED" }
    : { status: llmProviders > 0 ? "ok" : "notConfigured", code: null }

  return { checkedAt: now.toISOString(), connections: [...services, { id: "ai", label: "AI", ...ai }] }
}

/** {@link checkConnections}, cached for 5 minutes under {@link CONNECTION_HEALTH_TAG}. */
export const getConnectionHealth = unstable_cache(() => checkConnections(), [CONNECTION_HEALTH_TAG], {
  tags: [CONNECTION_HEALTH_TAG],
  revalidate: 300,
})

const live = (status: ConnectionStatus, code: HealthCode | null, now: Date): SectionHealth => ({
  status,
  code,
  checkedAt: now.toISOString(),
})

async function discordHealth(now: Date): Promise<SectionHealth> {
  const [integration, lock] = await Promise.all([
    prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { isEnabled: true, botEnabled: true, clientId: true, clientSecret: true, botToken: true },
    }),
    prisma.discordBotLock.findUnique({ where: { id: "discord-bot" }, select: { lastRenewedAt: true } }),
  ])
  const rows = discordStatus(
    {
      isEnabled: integration?.isEnabled ?? false,
      hasClientCredentials: Boolean(integration?.clientId && integration.clientSecret),
      botEnabled: integration?.botEnabled ?? false,
      hasBotToken: Boolean(integration?.botToken),
      lastRenewedAt: lock?.lastRenewedAt ?? null,
    },
    now
  )
  const toStatus = (enabled: boolean | undefined, tone: string): ConnectionStatus =>
    !enabled ? "disabled" : tone === "success" ? "ok" : tone === "destructive" ? "unreachable" : "incomplete"
  const status = worstStatus([
    toStatus(integration?.isEnabled, rows.linkedRoles.tone),
    toStatus(integration?.botEnabled, rows.supportBot.tone),
  ])
  const code: HealthCode | null = status === "unreachable" ? "BOT_OFFLINE" : status === "incomplete" ? "MISSING_SETUP" : null
  return live(status, code, now)
}

async function stripeHealth(now: Date): Promise<SectionHealth> {
  const stripe = await getStripeConfig()
  if (!stripe.enabled) return live("disabled", null, now)
  const ready = stripe.hasSecretKey && stripe.hasWebhookSecret && stripe.hasJobQueue && stripe.priceIds.length > 0
  return ready ? live("ok", null, now) : live("incomplete", "MISSING_SETUP", now)
}

/** A service's check, as the dependency of a feature that is on. */
function dependsOn(service: SectionHealth, now: Date): SectionHealth {
  if (service.status === "notConfigured") return live("incomplete", "MISSING_SETUP", now)
  if (service.status === "unreachable") return { ...service, code: "DEPENDENCY" }
  return service
}

async function rewindHealth(tautulli: SectionHealth, now: Date): Promise<SectionHealth> {
  const infra = await checkRewindInfra()
  if (!infra.ok) {
    return infra.code === "REDIS_UNAVAILABLE"
      ? live("unreachable", "REDIS_UNAVAILABLE", now)
      : live("incomplete", "MISSING_SETUP", now)
  }
  return dependsOn(tautulli, now)
}

/**
 * Every settings section's health (P10.19): the cached service checks, plus
 * the feature sections read live (see the module table). Admin only, because
 * it reads `getStripeConfig()`.
 */
export async function getSettingsHealth(now: Date = new Date()): Promise<SettingsHealth> {
  const [cached, config, discord, stripe] = await Promise.all([
    getConnectionHealth(),
    prisma.config.findUnique({ where: { id: "config" }, select: { llmDisabled: true, watchlistSyncEnabled: true } }),
    discordHealth(now),
    stripeHealth(now),
  ])
  const service = (id: ConnectionId): SectionHealth => {
    const entry = cached.connections.find((connection) => connection.id === id)
    if (!entry || entry.status === "notConfigured") return { status: "notConfigured", code: null, checkedAt: null }
    return { status: entry.status, code: entry.code, checkedAt: cached.checkedAt }
  }

  return {
    plex: service("plex"),
    tautulli: service("tautulli"),
    overseerr: service("overseerr"),
    ai: config?.llmDisabled ? live("degraded", "LLM_DISABLED", now) : service("ai"),
    discord,
    stripe,
    watchlist: config?.watchlistSyncEnabled ? dependsOn(service("overseerr"), now) : live("disabled", null, now),
    rewind: await rewindHealth(service("tautulli"), now),
    sonarr: service("sonarr"),
    radarr: service("radarr"),
    jellyfin: service("jellyfin"),
    prometheus: service("prometheus"),
  }
}
