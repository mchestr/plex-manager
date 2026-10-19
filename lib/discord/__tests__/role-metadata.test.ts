/**
 * Tests for lib/discord/role-metadata.ts.
 *
 * `computeRoleMetadata` reports exactly two Discord Linked-Roles fields:
 *   - is_subscribed: an entitled member (getAccessLevel "full") with live Plex
 *     server access (always present; false when indeterminate).
 *   - watched_hours: Tautulli-derived integer hours, recomputed only with
 *     `refreshHours`, otherwise the stored `lastWatchedHours`.
 *
 * The external service calls (Plex access check, Tautulli stats) and the
 * active-server / Tautulli lookups are mocked; the access level runs for real
 * against the typed Prisma mock.
 */

import {
  computeRoleMetadata,
  IS_SUBSCRIBED_KEY,
  WATCHED_HOURS_KEY,
} from "@/lib/discord/role-metadata"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { SubscriptionStatus } from "@/lib/generated/prisma/client"
import { fetchTautulliStatistics } from "@/lib/wrapped/tautulli-statistics"
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

jest.mock("@/lib/wrapped/tautulli-statistics", () => ({
  fetchTautulliStatistics: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const mockCheckAccess = checkUserServerAccess as jest.Mock
const mockGetPlexConfig = getActivePlexServerConfig as jest.Mock
const mockFetchStats = fetchTautulliStatistics as jest.Mock

const PLEX_SERVER = {
  name: "Home",
  url: "https://plex.example.com",
  token: "plex-token",
  publicUrl: undefined,
  adminPlexUserId: "admin-1",
}

const TAUTULLI_SERVER = {
  url: "https://tautulli.example.com",
  apiKey: "tautulli-key",
  isActive: true,
}

const USER = { id: "user-1", plexUserId: "user-42", lastWatchedHours: null }
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
  prismaMock.tautulli.findFirst.mockResolvedValue(null)
})

describe("computeRoleMetadata - is_subscribed", () => {
  it("reports is_subscribed=true when the user has Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(true)
    expect(mockCheckAccess).toHaveBeenCalledWith(
      {
        url: PLEX_SERVER.url,
        token: PLEX_SERVER.token,
        adminPlexUserId: PLEX_SERVER.adminPlexUserId,
      },
      USER.plexUserId
    )
  })

  it("with Stripe on, a canceled member is not subscribed even with Plex access", async () => {
    givenMember(true, { status: "CANCELED" })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("with Stripe on, an active subscriber with Plex access is subscribed", async () => {
    givenMember(true, { status: "ACTIVE" })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(true)
  })

  it("a disabled member is not subscribed, with Stripe off too", async () => {
    givenMember(false, { disabled: true })
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("reports is_subscribed=false when the user lacks Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: false })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("treats an unsuccessful access check as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: false, hasAccess: false, error: "boom" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("treats a missing active Plex server as not subscribed", async () => {
    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a user without a plexUserId as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)

    const { metadata } = await computeRoleMetadata({ ...USER, plexUserId: null }, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a thrown Plex access error as not subscribed (degradation)", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockRejectedValue(new Error("network down"))

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })
})

describe("computeRoleMetadata - watched_hours", () => {
  beforeEach(() => {
    // Isolate watched_hours tests from Plex access.
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })
  })

  it("derives integer hours from Tautulli totalWatchTime (minutes, floored)", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockResolvedValue({
      success: true,
      data: { totalWatchTime: 185 }, // 185 minutes -> 3 hours
    })

    const { metadata, watchedHours } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata[WATCHED_HOURS_KEY]).toBe(3)
    expect(watchedHours).toBe(3)
    expect(mockFetchStats).toHaveBeenCalledWith(
      { url: TAUTULLI_SERVER.url, apiKey: TAUTULLI_SERVER.apiKey },
      { plexUserId: USER.plexUserId },
      new Date().getFullYear()
    )
  })

  it("runs the Tautulli scan through the given limiter", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockResolvedValue({ success: true, data: { totalWatchTime: 120 } })
    const limiter: UpstreamLimiter = { run: jest.fn((_service, fn) => fn()) }

    await computeRoleMetadata(USER, { refreshHours: true, limiter })

    expect(limiter.run).toHaveBeenCalledWith("tautulli", expect.any(Function), { signal: undefined })
  })

  it("an event-driven sync reuses lastWatchedHours without calling Tautulli", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)

    const { metadata, watchedHours } = await computeRoleMetadata(
      { ...USER, lastWatchedHours: 42 },
      { refreshHours: false }
    )

    expect(metadata).toEqual({ [IS_SUBSCRIBED_KEY]: true, [WATCHED_HOURS_KEY]: 42 })
    expect(watchedHours).toBe(42)
    expect(mockFetchStats).not.toHaveBeenCalled()
    expect(prismaMock.tautulli.findFirst).not.toHaveBeenCalled()
  })

  it("an event-driven sync with no stored hours omits watched_hours", async () => {
    const { metadata, watchedHours } = await computeRoleMetadata(USER, { refreshHours: false })

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    expect(watchedHours).toBeNull()
  })

  it("omits watched_hours when Tautulli is not configured", async () => {
    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("omits watched_hours when the user has no plexUserId", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)

    const { metadata } = await computeRoleMetadata({ ...USER, plexUserId: null }, REFRESH)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("omits watched_hours when the stats lookup is unsuccessful", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockResolvedValue({ success: false, error: "no user" })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
  })

  it("keeps the stored hours when a refresh fails", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockRejectedValue(new Error("tautulli down"))

    const { metadata, watchedHours } = await computeRoleMetadata({ ...USER, lastWatchedHours: 7 }, REFRESH)

    expect(metadata[WATCHED_HOURS_KEY]).toBe(7)
    expect(watchedHours).toBe(7)
  })

  it("omits watched_hours when the stats lookup throws (degradation)", async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockRejectedValue(new Error("tautulli down"))

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    // Plex-derived field is unaffected by the Tautulli failure.
    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(true)
  })
})

describe("computeRoleMetadata - combined", () => {
  it("returns both fields when both sources succeed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })
    prismaMock.tautulli.findFirst.mockResolvedValue(TAUTULLI_SERVER as never)
    mockFetchStats.mockResolvedValue({
      success: true,
      data: { totalWatchTime: 3600 }, // 60 hours
    })

    const { metadata } = await computeRoleMetadata(USER, REFRESH)

    expect(metadata).toEqual({
      [IS_SUBSCRIBED_KEY]: true,
      [WATCHED_HOURS_KEY]: 60,
    })
  })

  it("matches the documented JSDoc example", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const { metadata } = await computeRoleMetadata(
      { id: "user-1", plexUserId: "123", lastWatchedHours: 42 },
      { refreshHours: false }
    )

    expect(metadata).toEqual({ is_subscribed: true, watched_hours: 42 })
  })
})
