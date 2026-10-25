/**
 * @jest-environment node
 */

/**
 * Admin writes that change member data leave an audit event (P11.16, GAP-33):
 * unsharing, importing members and regenerating a member's Rewind. Of
 * GAP-33's five writes, P1.2 deleted `forceUserWatchlistSync` and P8.8
 * deleted `savePlaygroundWrapped`; they must stay gone.
 */

import { readdirSync, readFileSync } from "fs"
import path from "path"

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { importPlexUsers } from "@/actions/import-plex-users"
import { adminRegenerateRewind } from "@/actions/rewind-generation"
import { unshareUserLibrary } from "@/actions/user-queries"
import { getAllPlexServerUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { checkRewindEligibility } from "@/lib/wrapped/eligibility"
import { getWrappedSettings } from "@/lib/wrapped/generation-settings"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), refresh: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({
  getAllPlexServerUsers: jest.fn(),
  unshareUserFromPlexServer: jest.fn(),
}))
jest.mock("@/lib/session-revocation", () => ({ endUserSessions: jest.fn() }))
jest.mock("@/lib/wrapped/generation-settings", () => ({ getWrappedSettings: jest.fn() }))
jest.mock("@/lib/queue/rewind-producers", () => ({ getRewindQueue: jest.fn() }))
jest.mock("@/lib/queue/rewind-infra", () => ({ checkRewindInfra: jest.fn() }))
jest.mock("@/lib/wrapped/eligibility", () => ({ checkRewindEligibility: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const ADMIN = "admin-1"

/** The audit events written, by type. */
function events(type: AuditEventType) {
  return jest.mocked(logAuditEvent).mock.calls.filter(([written]) => written === type)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: ADMIN, isAdmin: true }, expires: "" })
  prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ adminPlexUserId: "plex-owner" }))
})

describe("admin writes to member data", () => {
  it("unshareUserLibrary writes one MEMBER_UNSHARED for the member", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", plexUserId: "plex-1", isAdmin: false }))
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "removed" })

    await expect(unshareUserLibrary({ userId: "member-1" })).resolves.toMatchObject({ success: true })

    expect(events(AuditEventType.MEMBER_UNSHARED)).toEqual([
      [AuditEventType.MEMBER_UNSHARED, ADMIN, { targetUserId: "member-1", status: "removed" }],
    ])
  })

  it("an unshare Plex refused writes nothing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "member-1", plexUserId: "plex-1", isAdmin: false }))
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: false, code: "PLEX_UNAVAILABLE" })

    await unshareUserLibrary({ userId: "member-1" })

    expect(events(AuditEventType.MEMBER_UNSHARED)).toHaveLength(0)
  })

  it("importPlexUsers writes one MEMBERS_IMPORTED with the counts and the created ids", async () => {
    jest.mocked(getAllPlexServerUsers).mockResolvedValue({
      success: true,
      data: [
        { id: "plex-1", name: "One", email: "one@example.com", restricted: false, managed: false, pending: false },
        { id: "plex-2", name: "Two", email: "two@example.com", restricted: false, managed: false, pending: false },
        { id: "plex-3", name: "Three", email: "", restricted: false, managed: false, pending: true },
      ],
    })
    prismaMock.user.findMany.mockResolvedValue([buildUser({ plexUserId: "plex-2" })])
    prismaMock.user.create.mockResolvedValue(buildUser({ id: "new-user-1" }))

    await expect(importPlexUsers()).resolves.toMatchObject({ success: true })

    expect(events(AuditEventType.MEMBERS_IMPORTED)).toEqual([
      [
        AuditEventType.MEMBERS_IMPORTED,
        ADMIN,
        { imported: 1, skipped: 1, managed: 0, pending: 1, failed: 0, createdUserIds: ["new-user-1"] },
      ],
    ])
  })

  it("adminRegenerateRewind writes one REWIND_REGENERATE_REQUESTED for the member", async () => {
    jest.mocked(getWrappedSettings).mockResolvedValue({
      featureEnabled: true,
      seasonOpen: true,
      wrappedEnabled: true,
      wrappedYear: 2026,
    } as never)
    jest.mocked(checkRewindEligibility).mockResolvedValue({ eligible: true, tautulliUser: null })
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
    jest
      .mocked(getRewindQueue)
      .mockReturnValue({ add: async (_name: string, _data: unknown, opts: { jobId: string }) => ({ id: opts.jobId }) } as never)
    prismaMock.user.findUnique.mockResolvedValue({ id: "member-2", plexUserId: "plex-2" } as never)
    prismaMock.tautulli.findFirst.mockResolvedValue({ id: "tautulli" } as never)
    prismaMock.plexWrapped.findUniqueOrThrow.mockResolvedValue({ id: "wrapped-1" } as never)
    prismaMock.rewindGeneration.count.mockResolvedValue(0)

    await expect(adminRegenerateRewind({ userId: "member-2", year: 2026 })).resolves.toMatchObject({ success: true })

    const written = events(AuditEventType.REWIND_REGENERATE_REQUESTED)
    expect(written).toHaveLength(1)
    expect(written[0][2]).toMatchObject({ targetUserId: "member-2", year: 2026 })
  })
})

describe("GAP-33's deleted writes", () => {
  /** Every source file under the app's code folders. */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(full)
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
    })
  }

  it.each(["forceUserWatchlistSync", "savePlaygroundWrapped"])("%s no longer exists", (name) => {
    const root = path.join(__dirname, "../..")
    const hits = ["actions", "app", "lib", "components"]
      .flatMap((dir) => sources(path.join(root, dir)))
      .filter((file) => !file.includes(`${path.sep}generated${path.sep}`))
      .filter((file) => readFileSync(file, "utf8").includes(name))
    expect(hits).toEqual([])
  })
})
