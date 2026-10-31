/**
 * @jest-environment node
 */

/**
 * `getInactivityPreview`: the admin check before any read, the sweep's rules
 * over the sweep's member rows (each member counted once: protected, active,
 * without access or listed), the longest inactive first, the read the
 * preview stands on, the safety limit from the shares, and every way the
 * share list can fail to load.
 */

import { mockReset } from "jest-mock-extended"

import { buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { getActiveService } from "@/lib/data/active-service"
import { getInactivityPreview } from "@/lib/data/inactivity-preview"
import { listInactivityMembers } from "@/lib/inactivity/members"
import type { InactivityMember } from "@/lib/inactivity/rules"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/inactivity/members", () => ({ listInactivityMembers: jest.fn() }))

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date("2026-10-31T12:00:00Z")
const READ = new Date("2026-10-31T02:17:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)

let plexId = 100

/** A member with a Plex account and a share, read by the latest read, who joined long ago and never played. */
function member(id: string, patch: Partial<InactivityMember> = {}): InactivityMember {
  plexId += 1
  return {
    id,
    plexUserId: String(plexId),
    isAdmin: false,
    role: null,
    isExempt: false,
    inactivityExcluded: false,
    subscriptionStatus: null,
    createdAt: daysAgo(400),
    lastSeenAt: null,
    lastSeenReadAt: READ,
    ...patch,
  }
}

const plexUser = (id: string, pending = false): PlexTvUser => ({
  id,
  username: `user-${id}`,
  title: `user-${id}`,
  home: false,
  restricted: false,
  servers: [{ machineIdentifier: "machine-1", owned: false, pending }],
})

/** The members, with a share of this server for each unless listed in `withoutShare`. */
function given(members: InactivityMember[], withoutShare: string[] = []) {
  jest.mocked(listInactivityMembers).mockResolvedValue(members)
  jest.mocked(getPlexUsers).mockResolvedValue({
    success: true,
    data: members.filter((m) => m.plexUserId && !withoutShare.includes(m.id)).map((m) => plexUser(m.plexUserId!.trim())),
  })
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  plexId = 100
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(getActiveService).mockResolvedValue(buildPlexServer({ machineIdentifier: "machine-1", adminPlexUserId: "1" }) as never)
  jest.mocked(withMachineIdentifier).mockImplementation(async (server) => server)
  prismaMock.inactivityRun.findFirst.mockResolvedValue({ startedAt: READ } as never)
  prismaMock.user.findMany.mockImplementation((async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => buildUser({ id, name: `Name of ${id}` }))) as never)
  given([])
})

describe("getInactivityPreview", () => {
  it("refuses a member before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(getInactivityPreview(180, NOW)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(listInactivityMembers).not.toHaveBeenCalled()
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it("lists the inactive members with a share, the longest inactive first, with their names", async () => {
    given([
      member("u-recent-play", { lastSeenAt: daysAgo(200), createdAt: daysAgo(900) }),
      member("u-b", { createdAt: daysAgo(300) }),
      member("u-a", { createdAt: daysAgo(300) }),
      member("u-oldest", { lastSeenAt: daysAgo(500), createdAt: daysAgo(900) }),
    ])

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.rows).toEqual([
      { id: "u-oldest", name: "Name of u-oldest", lastSeenAt: daysAgo(500), lastActiveAt: daysAgo(500), createdAt: daysAgo(900) },
      // Equal last activity: by id, as the sweep orders them
      { id: "u-a", name: "Name of u-a", lastSeenAt: null, lastActiveAt: daysAgo(300), createdAt: daysAgo(300) },
      { id: "u-b", name: "Name of u-b", lastSeenAt: null, lastActiveAt: daysAgo(300), createdAt: daysAgo(300) },
      { id: "u-recent-play", name: "Name of u-recent-play", lastSeenAt: daysAgo(200), lastActiveAt: daysAgo(200), createdAt: daysAgo(900) },
    ])
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u-oldest", "u-a", "u-b", "u-recent-play"] } },
      select: { id: true, name: true, email: true },
    })
  })

  it("names a member by their email, then as an unknown member", async () => {
    given([member("u-mail"), member("u-blank"), member("u-gone")])
    prismaMock.user.findMany.mockResolvedValue([
      buildUser({ id: "u-mail", name: null, email: "mail@example.com" }),
      buildUser({ id: "u-blank", name: "", email: null }),
    ])

    const { rows } = await getInactivityPreview(180, NOW)

    expect(Object.fromEntries(rows.map((row) => [row.id, row.name]))).toEqual({
      "u-mail": "mail@example.com",
      "u-blank": "Unknown member",
      "u-gone": "Unknown member",
    })
  })

  it("counts every other member once: protected by the first rule, active, or without a share", async () => {
    given(
      [
        member("u-listed"),
        member("u-no-id", { plexUserId: null }),
        member("u-blank-id", { plexUserId: "  " }),
        member("u-admin", { isAdmin: true, isExempt: true }),
        member("u-owner", { plexUserId: " 1 " }),
        member("u-support", { role: "support" }),
        member("u-exempt", { isExempt: true }),
        member("u-paying", { subscriptionStatus: "ACTIVE" }),
        member("u-past-due", { subscriptionStatus: "PAST_DUE" }),
        member("u-excluded", { inactivityExcluded: true }),
        member("u-unread", { lastSeenReadAt: daysAgo(1) }),
        member("u-played", { lastSeenAt: daysAgo(10) }),
        member("u-joined", { createdAt: daysAgo(30) }),
        member("u-no-share"),
        member("u-canceled", { subscriptionStatus: "CANCELED" }),
      ],
      ["u-no-share"]
    )

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.rows.map((row) => row.id)).toEqual(["u-canceled", "u-listed"])
    expect(preview.skips).toEqual({ no_plex: 2, admin: 1, owner: 1, role: 1, exempt: 1, paying: 2, excluded: 1, not_read: 1 })
    expect(preview.active).toBe(2)
    expect(preview.noAccess).toBe(1)
    expect(preview.shareCheck).toBeNull()
  })

  it("counts a pending invite as no access", async () => {
    const pending = member("u-pending")
    jest.mocked(listInactivityMembers).mockResolvedValue([pending])
    jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: [plexUser(pending.plexUserId!, true)] })

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.rows).toEqual([])
    expect(preview.noAccess).toBe(1)
  })

  it("stands on the newest finished run whose read worked", async () => {
    given([member("u-1")])

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.readSince).toEqual(READ)
    expect(prismaMock.inactivityRun.findFirst).toHaveBeenCalledWith({
      where: { error: null, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    })
  })

  it("lists no one before a read has worked, since no member counts as read", async () => {
    prismaMock.inactivityRun.findFirst.mockResolvedValue(null)
    given([member("u-1"), member("u-2")])

    const preview = await getInactivityPreview(180, NOW)

    expect(preview).toMatchObject({ rows: [], readSince: null, skips: expect.objectContaining({ not_read: 2 }) })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("takes the threshold it is given", async () => {
    given([member("u-1", { lastSeenAt: daysAgo(60) })])

    await expect(getInactivityPreview(90, NOW)).resolves.toMatchObject({ rows: [], active: 1 })
    await expect(getInactivityPreview(60, NOW)).resolves.toMatchObject({ rows: [{ id: "u-1" }], active: 0 })
  })

  it("sets the safety limit from the members with a share", async () => {
    const members = Array.from({ length: 45 }, (_, i) => member(`u-${i}`, { lastSeenAt: daysAgo(1) }))
    given(members, ["u-0", "u-1", "u-2", "u-3", "u-4"])

    // 40 shared: 5% is 2
    await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ scheduledLimit: 2, active: 45 })
  })

  describe("when the shares cannot be read", () => {
    it.each([
      ["no Plex server is set up", "no_plex_server", () => jest.mocked(getActiveService).mockResolvedValue(null)],
      [
        "the server has no machine id",
        "plex_unavailable",
        () => jest.mocked(getActiveService).mockResolvedValue(buildPlexServer({ machineIdentifier: null }) as never),
      ],
      [
        "plex.tv refuses the token",
        "plex_auth",
        () => jest.mocked(getPlexUsers).mockResolvedValue({ success: false, error: "Unauthorized - invalid token", status: 401 }),
      ],
      [
        "plex.tv does not answer",
        "plex_unavailable",
        () => jest.mocked(getPlexUsers).mockResolvedValue({ success: false, error: "Plex is temporarily unavailable", status: 503 }),
      ],
      ["plex.tv sends no list", "plex_unavailable", () => jest.mocked(getPlexUsers).mockResolvedValue({ success: true })],
    ])("keeps every inactive member when %s, and says why", async (_case, block, arrange) => {
      jest.mocked(listInactivityMembers).mockResolvedValue([member("u-1"), member("u-2", { lastSeenAt: daysAgo(1) })])
      arrange()

      const preview = await getInactivityPreview(180, NOW)

      expect(preview).toMatchObject({ rows: [{ id: "u-1" }], active: 1, noAccess: 0, shareCheck: block, scheduledLimit: null })
    })

    it("reads no owner without a server", async () => {
      jest.mocked(getActiveService).mockResolvedValue(null)
      jest.mocked(listInactivityMembers).mockResolvedValue([member("u-1", { plexUserId: "1" })])

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [{ id: "u-1" }], skips: expect.objectContaining({ owner: 0 }) })
    })
  })
})
