/**
 * Connection health (P10.8, P10.19): statuses and codes, never error text,
 * the 5 s cut-off, the 5-minute cache tag, and the settings sections.
 */

import { mockReset } from "jest-mock-extended"
import { unstable_cache } from "next/cache"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { testPlexConnection } from "@/lib/connections/plex-connection"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { getStripeConfig } from "@/lib/data/admin-settings"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { checkConnections, getSettingsHealth } from "@/lib/settings/connection-health"
import { PROBE_TIMEOUT_MS } from "@/lib/settings/probe"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"

jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn: () => unknown) => fn) }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex-connection", () => ({ testPlexConnection: jest.fn() }))
jest.mock("@/lib/connections/tautulli", () => ({ testTautulliConnection: jest.fn() }))
jest.mock("@/lib/connections/jellyfin-connection", () => ({ testJellyfinConnection: jest.fn() }))
jest.mock("@/lib/connections/overseerr", () => ({ testOverseerrConnection: jest.fn() }))
jest.mock("@/lib/connections/sonarr", () => ({ testSonarrConnection: jest.fn() }))
jest.mock("@/lib/connections/radarr", () => ({ testRadarrConnection: jest.fn() }))
jest.mock("@/lib/connections/prometheus", () => ({ testPrometheusConnection: jest.fn() }))
jest.mock("@/lib/queue/rewind-infra", () => ({ checkRewindInfra: jest.fn() }))
jest.mock("@/lib/data/admin-settings", () => ({ getStripeConfig: jest.fn() }))

const STRIPE_OFF = {
  enabled: false,
  hasSecretKey: false,
  hasWebhookSecret: false,
  saved: { secretKey: null, webhookSecret: null },
  hasJobQueue: true,
  priceIds: [],
  librarySectionIds: [],
}

const SECRET = "connect ECONNREFUSED tautulli.internal:8181 apikey=hunter2"
const NOW = new Date("2026-12-10T18:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.plexServer.findFirst.mockResolvedValue({ name: "Home", url: "http://plex:32400", publicUrl: null, token: "t" } as never)
  prismaMock.tautulli.findFirst.mockResolvedValue({ name: "Tautulli", url: "http://tautulli:8181", publicUrl: null, apiKey: "k" } as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  prismaMock.lLMProvider.count.mockResolvedValue(1)
  jest.mocked(testPlexConnection).mockResolvedValue({ success: true })
  jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: SECRET })
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(getStripeConfig).mockResolvedValue(STRIPE_OFF)
})

const statusOf = (health: Awaited<ReturnType<typeof checkConnections>>, id: string) =>
  health.connections.find((entry) => entry.id === id)?.status

describe("checkConnections", () => {
  it("maps tester results to statuses and services without a row to notConfigured", async () => {
    const health = await checkConnections(NOW)

    expect(health.checkedAt).toBe(NOW.toISOString())
    expect(statusOf(health, "plex")).toBe("ok")
    expect(statusOf(health, "tautulli")).toBe("unreachable")
    for (const id of ["jellyfin", "overseerr", "sonarr", "radarr"]) expect(statusOf(health, id)).toBe("notConfigured")
    expect(testPlexConnection).toHaveBeenCalledWith(expect.objectContaining({ url: "http://plex:32400", token: "t", publicUrl: undefined }))
  })

  it("maps a tester that outlasts 5 s to unreachable with TIMEOUT", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(testPlexConnection).mockReturnValue(new Promise(() => {}))
      const pending = checkConnections(NOW)
      await jest.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
      const plex = (await pending).connections.find((entry) => entry.id === "plex")

      expect(plex).toMatchObject({ status: "unreachable", code: "TIMEOUT" })
    } finally {
      jest.useRealTimers()
    }
  })

  it("keeps a code for a failure, never the message", async () => {
    jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: "Invalid API key" })
    const tautulli = (await checkConnections(NOW)).connections.find((entry) => entry.id === "tautulli")

    expect(tautulli).toEqual({ id: "tautulli", label: "Tautulli", status: "unreachable", code: "UNAUTHORIZED" })
  })

  it("never carries a tester's error text, even when it throws", async () => {
    jest.mocked(testPlexConnection).mockRejectedValue(new Error(SECRET))
    const health = await checkConnections(NOW)

    expect(statusOf(health, "plex")).toBe("unreachable")
    expect(JSON.stringify(health)).not.toContain("hunter2")
  })

  it("reads AI as degraded while llmDisabled is on, and notConfigured without a provider", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))
    expect(statusOf(await checkConnections(NOW), "ai")).toBe("degraded")

    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
    prismaMock.lLMProvider.count.mockResolvedValue(0)
    expect(statusOf(await checkConnections(NOW), "ai")).toBe("notConfigured")
  })

  it("is cached for 5 minutes under the connection-health tag", () => {
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), [CONNECTION_HEALTH_TAG], {
      tags: [CONNECTION_HEALTH_TAG],
      revalidate: 300,
    })
  })
})

describe("getSettingsHealth", () => {
  it("reads AI as degraded at once while llmDisabled is on (UI-31)", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))
    const health = await getSettingsHealth(NOW)

    expect(health.ai).toEqual({ status: "degraded", code: "LLM_DISABLED", checkedAt: NOW.toISOString() })
    expect(health.plex).toEqual({ status: "ok", code: null, checkedAt: expect.any(String) })
    expect(health.sonarr).toEqual({ status: "notConfigured", code: null, checkedAt: null })
    expect(JSON.stringify(health)).not.toContain("hunter2")
  })

  it("gives Discord the worst of its enabled features, and Off with both off", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({
      isEnabled: true,
      botEnabled: true,
      clientId: "c",
      clientSecret: "s",
      botToken: "t",
    } as never)
    prismaMock.leaseLock.findUnique.mockResolvedValue({ lastRenewedAt: new Date(NOW.getTime() - 5 * 60_000) } as never)
    expect((await getSettingsHealth(NOW)).discord).toMatchObject({ status: "unreachable", code: "BOT_OFFLINE" })

    prismaMock.leaseLock.findUnique.mockResolvedValue({ lastRenewedAt: new Date(NOW.getTime() - 10_000) } as never)
    expect((await getSettingsHealth(NOW)).discord.status).toBe("ok")

    prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
    expect((await getSettingsHealth(NOW)).discord.status).toBe("disabled")
  })

  it("reads Stripe from getStripeConfig: Off, then Needs setup until every prerequisite exists", async () => {
    expect((await getSettingsHealth(NOW)).stripe.status).toBe("disabled")

    jest.mocked(getStripeConfig).mockResolvedValue({ ...STRIPE_OFF, enabled: true, hasSecretKey: true })
    expect((await getSettingsHealth(NOW)).stripe).toMatchObject({ status: "incomplete", code: "MISSING_SETUP" })

    jest.mocked(getStripeConfig).mockResolvedValue({ ...STRIPE_OFF, enabled: true, hasSecretKey: true, hasWebhookSecret: true, priceIds: ["price_1"] })
    expect((await getSettingsHealth(NOW)).stripe.status).toBe("ok")
  })

  it("ties Watchlist sync to Overseerr and Rewind to Redis, then Tautulli", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ watchlistSyncEnabled: true }))
    prismaMock.overseerr.findFirst.mockResolvedValue({ name: "O", url: "http://o:5055", publicUrl: null, apiKey: "k" } as never)
    jest.mocked(testOverseerrConnection).mockResolvedValue({ success: true })
    const health = await getSettingsHealth(NOW)

    expect(health.watchlist.status).toBe("ok")
    expect(health.rewind).toMatchObject({ status: "unreachable", code: "DEPENDENCY" })

    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: "REDIS_UNAVAILABLE" })
    expect((await getSettingsHealth(NOW)).rewind).toMatchObject({ status: "unreachable", code: "REDIS_UNAVAILABLE" })
  })
})
