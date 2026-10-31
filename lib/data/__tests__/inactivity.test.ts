/**
 * @jest-environment node
 */

/**
 * `getInactivityPage`: the admin check before any read, the settings (or the
 * defaults) with who saved them last, the newest runs with the names of the
 * members whose removal failed, whether Tautulli and Redis are set up, and
 * the preview for the saved threshold.
 */

import { mockReset } from "jest-mock-extended"

import { buildInactivityRun, buildInactivitySettings, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getActiveService } from "@/lib/data/active-service"
import { getInactivityPage } from "@/lib/data/inactivity"
import { getInactivityPreview, type InactivityPreview } from "@/lib/data/inactivity-preview"
import { isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/data/inactivity-preview", () => ({ getInactivityPreview: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))

const NOW = new Date("2026-10-31T12:00:00Z")
const SAVED_AT = new Date("2026-10-30T09:00:00Z")

const PREVIEW: InactivityPreview = {
  rows: [],
  skips: { no_plex: 0, admin: 1, owner: 0, role: 0, exempt: 0, paying: 0, excluded: 0, not_read: 0 },
  active: 4,
  noAccess: 0,
  shareCheck: null,
  scheduledLimit: 1,
  readSince: null,
}

const failed = (userId: string) => ({ userId, outcome: "failed", lastActiveAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null, code: "busy" })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getActiveService).mockResolvedValue(null)
  jest.mocked(getInactivityPreview).mockResolvedValue(PREVIEW)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  prismaMock.inactivitySettings.findUnique.mockResolvedValue(null)
  prismaMock.auditLog.findFirst.mockResolvedValue(null)
  prismaMock.inactivityRun.findMany.mockResolvedValue([])
})

describe("getInactivityPage", () => {
  it("refuses a member before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(getInactivityPage(NOW)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(prismaMock.inactivitySettings.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.inactivityRun.findMany).not.toHaveBeenCalled()
    expect(getInactivityPreview).not.toHaveBeenCalled()
  })

  it("reads the defaults on a fresh install, with nothing set up and no run yet", async () => {
    await expect(getInactivityPage(NOW)).resolves.toEqual({
      settings: { enabled: false, thresholdDays: 180 },
      lastSaved: null,
      runs: [],
      tautulliConfigured: false,
      redisConfigured: false,
      preview: PREVIEW,
    })
    expect(getInactivityPreview).toHaveBeenCalledWith(180, NOW)
    expect(getActiveService).toHaveBeenCalledWith("tautulli")
  })

  it("previews the saved threshold, and says when Tautulli and Redis are set up", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 90 }))
    jest.mocked(getActiveService).mockResolvedValue({ id: "tautulli-1", url: "http://tautulli:8181" } as never)
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    const page = await getInactivityPage(NOW)

    expect(page).toMatchObject({ settings: { enabled: true, thresholdDays: 90 }, tautulliConfigured: true, redisConfigured: true })
    expect(getInactivityPreview).toHaveBeenCalledWith(90, NOW)
  })

  describe("last saved", () => {
    it("reads the newest settings change and its admin's name", async () => {
      prismaMock.auditLog.findFirst.mockResolvedValue({ actorUserId: "admin-2", createdAt: SAVED_AT } as never)
      prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-2", name: "Dana Whitfield" }))

      const { lastSaved } = await getInactivityPage(NOW)

      expect(lastSaved).toEqual({ at: SAVED_AT, by: "Dana Whitfield" })
      expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith({
        where: { type: AuditEventType.INACTIVITY_SETTINGS_CHANGED },
        orderBy: { createdAt: "desc" },
        select: { actorUserId: true, createdAt: true },
      })
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin-2" }, select: { name: true, email: true } })
    })

    it.each([
      ["the email when the admin has no name", buildUser({ name: null, email: "dana@example.com" }), "dana@example.com"],
      ["an admin when they have neither", buildUser({ name: null, email: null }), "an admin"],
      ["an admin when their row is gone", null, "an admin"],
    ])("names %s", async (_case, actor, by) => {
      prismaMock.auditLog.findFirst.mockResolvedValue({ actorUserId: "admin-2", createdAt: SAVED_AT } as never)
      prismaMock.user.findUnique.mockResolvedValue(actor)

      await expect(getInactivityPage(NOW)).resolves.toMatchObject({ lastSaved: { at: SAVED_AT, by } })
    })
  })

  describe("runs", () => {
    it("lists the newest 30 runs without their stored entries", async () => {
      const run = buildInactivityRun({ id: "run-1", trigger: "admin", tautulliUsers: 12, matched: 10, qualified: 2, removed: 2 })
      prismaMock.inactivityRun.findMany.mockResolvedValue([run])

      const { runs } = await getInactivityPage(NOW)

      const { entries: _entries, ...stored } = run
      expect(runs).toEqual([{ ...stored, failedMembers: [] }])
      expect(prismaMock.inactivityRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startedAt: "desc" }, take: 30 })
      )
      // No failed entry, so no name lookup
      expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    })

    it("names the members whose removal failed, in one read for every run", async () => {
      prismaMock.inactivityRun.findMany.mockResolvedValue([
        buildInactivityRun({
          id: "run-2",
          failed: 2,
          entries: [failed("u-ana"), failed("u-gone"), { ...failed("u-bo"), outcome: "removed" }, { userId: 7 }],
        }),
        buildInactivityRun({ id: "run-1", failed: 2, entries: [failed("u-ana"), failed("u-mail")] }),
      ])
      prismaMock.user.findMany.mockResolvedValue([
        buildUser({ id: "u-ana", name: "Ana Lopez" }),
        buildUser({ id: "u-mail", name: "", email: "mail@example.com" }),
      ])

      const { runs } = await getInactivityPage(NOW)

      expect(runs.map((run) => run.failedMembers)).toEqual([["Ana Lopez", "Removed user"], ["Ana Lopez", "mail@example.com"]])
      expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["u-ana", "u-gone", "u-mail"] } },
        select: { id: true, name: true, email: true },
      })
    })

    it("calls a failed member with neither a name nor an email an unknown member", async () => {
      prismaMock.inactivityRun.findMany.mockResolvedValue([buildInactivityRun({ failed: 1, entries: [failed("u-blank")] })])
      prismaMock.user.findMany.mockResolvedValue([buildUser({ id: "u-blank", name: null, email: null })])

      const { runs } = await getInactivityPage(NOW)

      expect(runs[0].failedMembers).toEqual(["Unknown member"])
    })
  })
})
