/**
 * Tests for lib/discord/role-metadata.ts.
 *
 * `computeRoleMetadata` reports exactly two Discord Linked-Roles fields:
 *   - is_subscribed: an entitled member (getAccessLevel "full") with live
 *     access on a service: a Plex share, or an enabled Jellyfin account.
 *   - watched_hours: the member's year stats in whole hours, recomputed only
 *     with `refreshHours`, otherwise the stored `lastWatchedHours`.
 *
 * The external service calls (Plex access check, Jellyfin user, year stats)
 * and the active-server lookups are mocked; the access level runs for real
 * against the typed Prisma mock.
 */

import {
  computeRoleMetadata,
  IS_SUBSCRIBED_KEY,
  WATCHED_HOURS_KEY,
} from "@/lib/discord/role-metadata"
import { getJellyfinUserById } from "@/lib/connections/jellyfin-users"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getMemberYearStats, memberStatsYear } from "@/lib/discord/stats/member-stats"
import { statsFromFacts, type MemberYearStats } from "@/lib/discord/stats/year-stats"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import type { UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock("@/lib/connections/plex", () => ({
  checkUserServerAccess: jest.fn(),
}))

jest.mock("@/lib/connections/plex-config", () => ({
  getActivePlexServerConfig: jest.fn(),
}))

jest.mock("@/lib/connections/jellyfin-users", () => ({
  getJellyfinUserById: jest.fn(),
}))

jest.mock("@/lib/discord/stats/member-stats", () => ({
  getMemberYearStats: jest.fn(),
  memberStatsYear: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const mockCheckAccess = checkUserServerAccess as jest.Mock
const mockGetPlexConfig = getActivePlexServerConfig as jest.Mock
const mockGetJellyfinUser = getJellyfinUserById as jest.Mock
const mockFetchStats = getMemberYearStats as jest.Mock
const mockStatsYear = memberStatsYear as jest.Mock

const PLEX_SERVER = {
  name: "Home",
  url: "https://plex.example.com",
  token: "plex-token",
  publicUrl: undefined,
  adminPlexUserId: "admin-1",
  machineIdentifier: "this-server-machine-id",
}

const JELLYFIN_SERVER = { url: "https://jellyfin.example.com", apiKey: "jf-key" }

const USER = { id: "user-1", plexUserId: "user-42", jellyfinUserId: null, timezone: null, lastWatchedHours: null }
const JELLYFIN_MEMBER = { ...USER, plexUserId: null, jellyfinUserId: "jf-1" }

/** Year stats with `totalMinutes` watched. */
function statsOf(totalMinutes: number): { ok: true; stats: MemberYearStats } {
  return {
    ok: true,
    stats: {
      year: 2026,
      source: "history",
      totalMinutes,
      counts: { episodes: 0, series: 0, films: 0 },
      topShow: null,
      topFilm: null,
      peakHour: null,
      longestStreakDays: null,
    },
  }
}
const REFRESH = { refreshHours: true }

/** The access level's inputs: Stripe gating and the member's row. */
function givenMember(stripeEnabled: boolean, member: { status?: SubscriptionStatus; disabled?: boolean } = {}) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled }))
  prismaMock.user.findUnique.mockResolvedValue({
    disabledAt: member.disabled ? new Date() : null,
    isAdmin: false,
    isExempt: false,
    subscription: member.status ? { status: member.status } : null,
  } as never)
  prismaMock.plexWrapped.findFirst.mockResolvedValue(null)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  // Sensible defaults: Stripe off, an enabled member, no Plex server, no Tautulli.
  givenMember(false)
  mockGetPlexConfig.mockResolvedValue(null)
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
  mockStatsYear.mockResolvedValue({ year: 2026, zone: "America/Chicago" })
  mockFetchStats.mockResolvedValue({ ok: false, code: "NO_TAUTULLI" })
})

describe("computeRoleMetadata - is_subscribed", () => {
  it("reports is_subscribed=true when the user has Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(true)
    expect(mockCheckAccess).toHaveBeenCalledWith(
      {
        url: PLEX_SERVER.url,
        token: PLEX_SERVER.token,
        adminPlexUserId: PLEX_SERVER.adminPlexUserId,
        machineIdentifier: PLEX_SERVER.machineIdentifier,
      },
      USER.plexUserId
    )
  })

  it("with Stripe on, a canceled member is not subscribed even with Plex access", async () => {
    givenMember(true, { status: "CANCELED" })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("with Stripe on, an active subscriber with Plex access is subscribed", async () => {
    givenMember(true, { status: "ACTIVE" })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(true)
  })

  it("a disabled member is not subscribed, with Stripe off too", async () => {
    givenMember(false, { disabled: true })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("reports is_subscribed=false when the user lacks Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "denied" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it.each([
    ["a 503", { status: "unknown", reason: "plex_unavailable" }],
    ["a 429", { status: "unknown", reason: "rate_limited", retryAfterSec: 30 }],
    ["an unreachable PMS", { status: "unknown", reason: "server_unreachable" }],
  ] as const)("pushes no update when access is unknown after %s, keeping the stored hours", async (_label, result) => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue(result)

    const outcome = await computeRoleMetadata({ ...USER, lastWatchedHours: 12 }, REFRESH)

    expect(outcome).toEqual({ metadata: null, watchedHours: 12 })
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("treats a missing active Plex server as not subscribed", async () => {
    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a user without a plexUserId as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)

    const { metadata } = await computeRoleMetadata({ ...USER, plexUserId: null }, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a thrown Plex access error as unknown: no update", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockRejectedValue(new Error("network down"))

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata).toBeNull()
  })
})

describe("computeRoleMetadata - Jellyfin access", () => {
  beforeEach(() => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(JELLYFIN_SERVER as never)
  })

  it("counts an enabled Jellyfin account as subscribed", async () => {
    mockGetJellyfinUser.mockResolvedValue({ success: true, data: { Id: "jf-1", Policy: { IsDisabled: false } } })

    const { metadata } = await computeRoleMetadata(JELLYFIN_MEMBER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(true)
    expect(mockGetJellyfinUser).toHaveBeenCalledWith(JELLYFIN_SERVER, "jf-1")
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("does not count a disabled Jellyfin account", async () => {
    mockGetJellyfinUser.mockResolvedValue({ success: true, data: { Id: "jf-1", Policy: { IsDisabled: true } } })

    const { metadata } = await computeRoleMetadata(JELLYFIN_MEMBER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("does not count an account Jellyfin no longer has", async () => {
    mockGetJellyfinUser.mockResolvedValue({ success: false, notFound: true, error: "User not found" })

    const { metadata } = await computeRoleMetadata(JELLYFIN_MEMBER, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("pushes no update when Jellyfin cannot answer", async () => {
    mockGetJellyfinUser.mockResolvedValue({ success: false, error: "Failed to fetch user" })

    expect(await computeRoleMetadata({ ...JELLYFIN_MEMBER, lastWatchedHours: 5 }, REFRESH)).toEqual({
      metadata: null,
      watchedHours: 5,
    })
  })

  it("a member with both services is subscribed when Plex is unknown but Jellyfin is enabled", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "unknown", reason: "plex_unavailable" })
    mockGetJellyfinUser.mockResolvedValue({ success: true, data: { Id: "jf-1", Policy: { IsDisabled: false } } })

    const { metadata } = await computeRoleMetadata({ ...USER, jellyfinUserId: "jf-1" }, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(true)
  })

  it("a member with both services is not subscribed when Plex denies and Jellyfin is disabled", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "denied" })
    mockGetJellyfinUser.mockResolvedValue({ success: true, data: { Id: "jf-1", Policy: { IsDisabled: true } } })

    const { metadata } = await computeRoleMetadata({ ...USER, jellyfinUserId: "jf-1" }, REFRESH)

    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(false)
  })
})

describe("computeRoleMetadata - watched_hours", () => {
  beforeEach(() => {
    // Isolate watched_hours tests from Plex access.
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })
  })

  it("derives integer hours from the member's year stats (minutes, floored)", async () => {
    mockFetchStats.mockResolvedValue(statsOf(185)) // 185 minutes -> 3 hours

    const { metadata, watchedHours } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[WATCHED_HOURS_KEY]).toBe(3)
    expect(watchedHours).toBe(3)
    expect(mockStatsYear).toHaveBeenCalledWith(null)
    expect(mockFetchStats).toHaveBeenCalledWith(USER.id, {
      year: 2026,
      zone: "America/Chicago",
      limiter: expect.anything(),
      signal: undefined,
    })
  })

  it("takes the year in the member's own zone", async () => {
    mockFetchStats.mockResolvedValue(statsOf(60))

    await computeRoleMetadata({ ...USER, timezone: "America/Los_Angeles" }, REFRESH)

    expect(mockStatsYear).toHaveBeenCalledWith("America/Los_Angeles")
  })

  it("reads hours from the stored Rewind's facts", async () => {
    const facts = { "time.totalMinutes": { value: 78420, display: "78,420 minutes", unit: "duration" as const } }
    mockFetchStats.mockResolvedValue({ ok: true, stats: statsFromFacts(2026, facts) })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata?.[WATCHED_HOURS_KEY]).toBe(1307)
  })

  it("passes the given limiter to the stats read", async () => {
    mockFetchStats.mockResolvedValue(statsOf(120))
    const limiter: UpstreamLimiter = { run: jest.fn((_service, fn) => fn()) }

    await computeRoleMetadata(USER, { refreshHours: true, limiter })

    expect(mockFetchStats).toHaveBeenCalledWith(USER.id, expect.objectContaining({ limiter }))
  })

  it("an event-driven sync reuses lastWatchedHours without reading stats", async () => {
    const { metadata, watchedHours } = await computeRoleMetadata(
      { ...USER, lastWatchedHours: 42 },
      { refreshHours: false }
    )

    expect(metadata).toEqual({ [IS_SUBSCRIBED_KEY]: true, [WATCHED_HOURS_KEY]: 42 })
    expect(watchedHours).toBe(42)
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("an event-driven sync with no stored hours omits watched_hours", async () => {
    const { metadata, watchedHours } = await computeRoleMetadata(USER, { refreshHours: false })

    expect(WATCHED_HOURS_KEY in (metadata ?? {})).toBe(false)
    expect(watchedHours).toBeNull()
  })

  it("omits watched_hours when no stats can be read", async () => {
    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(WATCHED_HOURS_KEY in (metadata ?? {})).toBe(false)
  })

  it("keeps the stored hours when a refresh fails", async () => {
    mockFetchStats.mockResolvedValue({ ok: false, code: "UNAVAILABLE" })

    const { metadata, watchedHours } = await computeRoleMetadata({ ...USER, lastWatchedHours: 7 }, REFRESH)

    expect(metadata?.[WATCHED_HOURS_KEY]).toBe(7)
    expect(watchedHours).toBe(7)
  })

  it("omits watched_hours when the stats read throws (degradation)", async () => {
    mockFetchStats.mockRejectedValue(new Error("tautulli down"))

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(WATCHED_HOURS_KEY in (metadata ?? {})).toBe(false)
    // The access field is unaffected by the stats failure.
    expect(metadata?.[IS_SUBSCRIBED_KEY]).toBe(true)
  })
})

describe("computeRoleMetadata - combined", () => {
  it("returns both fields when both sources succeed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })
    mockFetchStats.mockResolvedValue(statsOf(3600)) // 60 hours

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata).toEqual({
      [IS_SUBSCRIBED_KEY]: true,
      [WATCHED_HOURS_KEY]: 60,
    })
  })

  it("matches the documented JSDoc example", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ status: "granted" })

    const { metadata } = await computeRoleMetadata(
      { id: "user-1", plexUserId: "123", jellyfinUserId: null, timezone: null, lastWatchedHours: 42 },
      { refreshHours: false }
    )

    expect(metadata).toEqual({ is_subscribed: true, watched_hours: 42 })
  })
})
