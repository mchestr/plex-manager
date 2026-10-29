/**
 * @jest-environment node
 */

/** `recheckConnections`: admin only, expires the cached checks, then runs them again. */

import { getServerSession } from "next-auth"
import { updateTag } from "next/cache"

import { recheckConnections } from "@/actions/admin/connection-health"
import { consume } from "@/lib/security/rate-limit"
import { getSettingsHealth } from "@/lib/settings/connection-health"
import { CONNECTION_HEALTH_TAG, type SettingsHealth } from "@/lib/settings/connection-status"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ updateTag: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/settings/connection-health", () => ({ getSettingsHealth: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(consume).mockResolvedValue({ ok: true })
})

describe("recheckConnections", () => {
  it("expires the cached checks before it runs them again", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
    const ok = { status: "ok", code: null, checkedAt: "2026-10-29T12:00:00.000Z" } as const
    const off = { status: "notConfigured", code: null, checkedAt: null } as const
    const health: SettingsHealth = {
      plex: ok,
      tautulli: ok,
      overseerr: ok,
      ai: off,
      discord: off,
      stripe: off,
      rewind: ok,
      sonarr: off,
      radarr: off,
      jellyfin: off,
    }
    jest.mocked(getSettingsHealth).mockImplementation(async () => {
      expect(updateTag).toHaveBeenCalledWith(CONNECTION_HEALTH_TAG)
      return health
    })

    await expect(recheckConnections()).resolves.toEqual({ success: true, data: health })
    expect(consume).toHaveBeenCalledWith("admin", "admin-1")
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false }, expires: "" })

    await expect(recheckConnections()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(getSettingsHealth).not.toHaveBeenCalled()
  })
})
