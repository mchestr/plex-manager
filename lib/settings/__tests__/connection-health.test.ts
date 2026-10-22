/**
 * Connection health (P10.8's minimal P10.19 reader): statuses, never error
 * text, and the 5-minute cache tag.
 */

import { mockReset } from "jest-mock-extended"
import { unstable_cache } from "next/cache"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { testPlexConnection } from "@/lib/connections/plex-connection"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { checkConnections, CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-health"

jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn: () => unknown) => fn) }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex-connection", () => ({ testPlexConnection: jest.fn() }))
jest.mock("@/lib/connections/tautulli", () => ({ testTautulliConnection: jest.fn() }))
jest.mock("@/lib/connections/jellyfin-connection", () => ({ testJellyfinConnection: jest.fn() }))
jest.mock("@/lib/connections/overseerr", () => ({ testOverseerrConnection: jest.fn() }))
jest.mock("@/lib/connections/sonarr", () => ({ testSonarrConnection: jest.fn() }))
jest.mock("@/lib/connections/radarr", () => ({ testRadarrConnection: jest.fn() }))

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
