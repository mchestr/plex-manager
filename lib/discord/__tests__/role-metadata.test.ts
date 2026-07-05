/**
 * Tests for lib/discord/role-metadata.ts.
 *
 * `computeRoleMetadata` reports exactly two Discord Linked-Roles fields:
 *   - is_subscribed: live Plex server access (always present; false when
 *     indeterminate).
 *   - watched_hours: Tautulli-derived integer hours (present only on success).
 *
 * The external service calls (Plex access check, Tautulli stats) and the
 * active-server / Tautulli lookups are mocked so the pure derivation logic —
 * and its degradation paths — can be asserted directly.
 */

import {
  computeRoleMetadata,
  IS_SUBSCRIBED_KEY,
  WATCHED_HOURS_KEY,
} from "@/lib/discord/role-metadata"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { fetchTautulliStatistics } from "@/lib/wrapped/statistics"
import { prisma } from "@/lib/prisma"

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

jest.mock("@/lib/wrapped/statistics", () => ({
  fetchTautulliStatistics: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tautulli: {
      findFirst: jest.fn(),
    },
  },
}))

const mockCheckAccess = checkUserServerAccess as jest.Mock
const mockGetPlexConfig = getActivePlexServerConfig as jest.Mock
const mockFetchStats = fetchTautulliStatistics as jest.Mock
const mockTautulliFindFirst = prisma.tautulli.findFirst as jest.Mock

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

const USER = { plexUserId: "user-42", email: "user@example.com" }

beforeEach(() => {
  jest.clearAllMocks()
  // Sensible defaults: no Plex server, no Tautulli. Individual tests override.
  mockGetPlexConfig.mockResolvedValue(null)
  mockTautulliFindFirst.mockResolvedValue(null)
})

describe("computeRoleMetadata - is_subscribed", () => {
  it("reports is_subscribed=true when the user has Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })

    const metadata = await computeRoleMetadata(USER)

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

  it("reports is_subscribed=false when the user lacks Plex access", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: false })

    const metadata = await computeRoleMetadata(USER)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("treats an unsuccessful access check as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: false, hasAccess: false, error: "boom" })

    const metadata = await computeRoleMetadata(USER)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
  })

  it("treats a missing active Plex server as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(null)

    const metadata = await computeRoleMetadata(USER)

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a user without a plexUserId as not subscribed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)

    const metadata = await computeRoleMetadata({ plexUserId: null, email: "x@y.z" })

    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(false)
    expect(mockCheckAccess).not.toHaveBeenCalled()
  })

  it("treats a thrown Plex access error as not subscribed (degradation)", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockRejectedValue(new Error("network down"))

    const metadata = await computeRoleMetadata(USER)

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
    mockTautulliFindFirst.mockResolvedValue(TAUTULLI_SERVER)
    mockFetchStats.mockResolvedValue({
      success: true,
      data: { totalWatchTime: 185 }, // 185 minutes -> 3 hours
    })

    const metadata = await computeRoleMetadata(USER)

    expect(metadata[WATCHED_HOURS_KEY]).toBe(3)
    expect(mockFetchStats).toHaveBeenCalledWith(
      { url: TAUTULLI_SERVER.url, apiKey: TAUTULLI_SERVER.apiKey },
      USER.plexUserId,
      USER.email,
      new Date().getFullYear()
    )
  })

  it("omits watched_hours when Tautulli is not configured", async () => {
    mockTautulliFindFirst.mockResolvedValue(null)

    const metadata = await computeRoleMetadata(USER)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("omits watched_hours when the user has no plexUserId", async () => {
    mockTautulliFindFirst.mockResolvedValue(TAUTULLI_SERVER)

    const metadata = await computeRoleMetadata({ plexUserId: null, email: "x@y.z" })

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    expect(mockFetchStats).not.toHaveBeenCalled()
  })

  it("omits watched_hours when the stats lookup is unsuccessful", async () => {
    mockTautulliFindFirst.mockResolvedValue(TAUTULLI_SERVER)
    mockFetchStats.mockResolvedValue({ success: false, error: "no user" })

    const metadata = await computeRoleMetadata(USER)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
  })

  it("omits watched_hours when the stats lookup throws (degradation)", async () => {
    mockTautulliFindFirst.mockResolvedValue(TAUTULLI_SERVER)
    mockFetchStats.mockRejectedValue(new Error("tautulli down"))

    const metadata = await computeRoleMetadata(USER)

    expect(WATCHED_HOURS_KEY in metadata).toBe(false)
    // Plex-derived field is unaffected by the Tautulli failure.
    expect(metadata[IS_SUBSCRIBED_KEY]).toBe(true)
  })
})

describe("computeRoleMetadata - combined", () => {
  it("returns both fields when both sources succeed", async () => {
    mockGetPlexConfig.mockResolvedValue(PLEX_SERVER)
    mockCheckAccess.mockResolvedValue({ success: true, hasAccess: true })
    mockTautulliFindFirst.mockResolvedValue(TAUTULLI_SERVER)
    mockFetchStats.mockResolvedValue({
      success: true,
      data: { totalWatchTime: 3600 }, // 60 hours
    })

    const metadata = await computeRoleMetadata(USER)

    expect(metadata).toEqual({
      [IS_SUBSCRIBED_KEY]: true,
      [WATCHED_HOURS_KEY]: 60,
    })
  })
})
