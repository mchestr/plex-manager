/**
 * @jest-environment node
 */

/**
 * `getInactivityPreview`: the admin check before any read, the sweep's rules
 * over the sweep's member rows (each member counted once: protected, active,
 * without access or listed), the longest inactive first, the read the
 * preview stands on, the safety limit from the shares, every way the share
 * list can fail to load, and the warning lists: who waits for a date, who
 * the next run warns first, and who of them the app cannot email.
 */

import { mockReset } from "jest-mock-extended"

import { buildInactivitySettings, buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { getActiveService } from "@/lib/data/active-service"
import { getInactivityPreview } from "@/lib/data/inactivity-preview"
import { listInactivityMembers } from "@/lib/inactivity/members"
import type { NoticeRow } from "@/lib/inactivity/notices"
import type { InactivityMember } from "@/lib/inactivity/rules"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/inactivity/members", () => ({ listInactivityMembers: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Toronto") }))

/** The notice rows the sweep and the preview read. */
const noticeRows = (rows: NoticeRow[]) => prismaMock.inactivityNotice.findMany.mockResolvedValue(rows as never)

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
    inactivityExcluded: false,
    subscriptionStatus: null,
    createdAt: daysAgo(400),
    lastSeenAt: null,
    lastSeenReadAt: READ,
    accessEndedAt: null,
    accessRestoredAt: null,
    timezone: null,
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
  prismaMock.inactivityRun.findFirst.mockResolvedValue({ startedAt: READ, newestPlayAt: READ } as never)
  prismaMock.inactivityNotice.findMany.mockResolvedValue([] as never)
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
      select: { id: true, name: true, email: true, disabledAt: true, inactivityEmailsOff: true },
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
        member("u-admin", { isAdmin: true }),
        member("u-owner", { plexUserId: " 1 " }),
        member("u-support", { role: "support" }),
        member("u-invited"),
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

    expect(preview.rows.map((row) => row.id)).toEqual(["u-canceled", "u-invited", "u-listed"])
    expect(preview.skips).toEqual({ no_plex: 2, admin: 1, owner: 1, role: 1, paying: 2, excluded: 1, not_read: 1 })
    expect(preview.active).toBe(2)
    expect(preview.noAccess).toBe(1)
    expect(preview.shareCheck).toBeNull()
  })

  it("counts a member given access back since it ended as active, as a run would, without writing anything", async () => {
    // Removed 300 days ago and shared again in Plex: the run stamps the return, so it does not list them
    const reshared = member("u-reshared", { lastSeenAt: daysAgo(400), accessEndedAt: daysAgo(300) })
    // Removed and not shared again: still listed only by the share check, as no access
    const removed = member("u-removed", { lastSeenAt: daysAgo(400), accessEndedAt: daysAgo(300) })
    given([reshared, removed], ["u-removed"])

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.rows).toEqual([])
    expect(preview.active).toBe(1)
    expect(preview.noAccess).toBe(1)
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it("does not count a return while the share list is unknown", async () => {
    const removed = member("u-removed", { lastSeenAt: daysAgo(400), accessEndedAt: daysAgo(300) })
    jest.mocked(listInactivityMembers).mockResolvedValue([removed])
    jest.mocked(getPlexUsers).mockResolvedValue({ success: false, status: 503, error: "Unavailable" })

    const preview = await getInactivityPreview(180, NOW)

    expect(preview.shareCheck).toBe("plex_unavailable")
    expect(preview.rows.map((row) => row.id)).toEqual(["u-removed"])
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
    expect(prismaMock.inactivityRun.findFirst).toHaveBeenCalledWith({
      where: { finishedAt: { not: null }, newestPlayAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { newestPlayAt: true },
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
  describe("the removal gate", () => {
    const notice = (userId: string, patch: Partial<NoticeRow>): NoticeRow => ({
      id: `n-${userId}-${patch.leadDays ?? 30}`,
      userId,
      cycleAt: daysAgo(400),
      leadDays: 30,
      removeAfter: daysAgo(2),
      status: "sent",
      code: null,
      attempts: 1,
      zone: "America/Toronto",
      handledAt: daysAgo(30),
      ...patch,
    })

    it("holds a member before a date a handled warning named, with warnings off", async () => {
      given([member("u-1", { lastSeenAt: daysAgo(400) }), member("u-2")])
      noticeRows([notice("u-1", { removeAfter: new Date(NOW.getTime() + DAY) })])

      const preview = await getInactivityPreview(180, NOW)

      expect(preview).toMatchObject({ rows: [{ id: "u-2" }], held: 1 })
      expect(prismaMock.inactivityNotice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ["u-1", "u-2"] } } }))
    })

    it("lists only fully warned members with warnings on, gated on the stored run's newest play", async () => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))
      given([member("warned", { lastSeenAt: daysAgo(400) }), member("unwarned", { lastSeenAt: daysAgo(400) })])
      noticeRows([
        notice("warned", { leadDays: 30 }),
        notice("warned", { leadDays: 1, handledAt: new Date(READ.getTime() - 20 * 60 * 60 * 1000) }),
      ])

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [{ id: "warned" }], held: 1 })

      // No play on the server after the last warning, by the stored run's read
      prismaMock.inactivityRun.findFirst.mockResolvedValue({ startedAt: READ, newestPlayAt: daysAgo(3) } as never)
      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [], held: 2 })
    })

    it("gates on the newest play of the newest run that found one, when a later run stored none", async () => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))
      given([member("warned", { lastSeenAt: daysAgo(400) })])
      noticeRows([
        notice("warned", { leadDays: 30 }),
        notice("warned", { leadDays: 1, handledAt: new Date(READ.getTime() - 20 * 60 * 60 * 1000) }),
      ])
      // The newest read stored no play; the run before it found one after the last warning
      prismaMock.inactivityRun.findFirst.mockImplementation((async ({ where }: { where: { newestPlayAt?: unknown } }) =>
        where.newestPlayAt ? { newestPlayAt: READ } : { startedAt: READ }) as never)

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [{ id: "warned" }], held: 0 })
    })

    it("counts the inactive members held for having no warning yet, with warnings on", async () => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))
      given([member("u-1", { lastSeenAt: daysAgo(400) }), member("u-2", { lastSeenAt: daysAgo(400) }), member("dated", { lastSeenAt: daysAgo(400) })])
      noticeRows([notice("dated", { removeAfter: new Date(NOW.getTime() + DAY), status: "pending", handledAt: null })])

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [], held: 3, unwarned: 2 })
    })

    describe("failed warnings", () => {
      const on = () => prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))

      it("lists the members whose newest warning of the cycle failed, and which no run tries again", async () => {
        on()
        given([member("retry"), member("stuck"), member("replaced"), member("old-cycle", { lastSeenAt: daysAgo(300) })])
        const later = new Date(NOW.getTime() + 5 * DAY)
        noticeRows([
          notice("retry", { status: "failed", attempts: 3, handledAt: null }),
          notice("stuck", { status: "failed", attempts: 9, handledAt: null }),
          // A later stage for the same date went out
          notice("replaced", { leadDays: 30, removeAfter: later, status: "failed", attempts: 3, handledAt: null }),
          notice("replaced", { leadDays: 7, removeAfter: later }),
          // A row of an earlier cycle: the member played since
          notice("old-cycle", { status: "failed", attempts: 9, handledAt: null }),
        ])

        const preview = await getInactivityPreview(180, NOW)

        expect(preview.failedWarnings).toEqual([
          { id: "retry", name: "Name of retry", stuck: false },
          { id: "stuck", name: "Name of stuck", stuck: true },
        ])
      })

      it("lists a failed last warning, but not a failed reminder, which does not hold the removal", async () => {
        on()
        given([member("reminder"), member("last")])
        noticeRows([
          notice("reminder", { leadDays: 30 }),
          notice("reminder", { leadDays: 7, status: "failed", attempts: 9, handledAt: null }),
          notice("last", { leadDays: 30 }),
          notice("last", { leadDays: 7 }),
          notice("last", { leadDays: 1, status: "failed", attempts: 9, handledAt: null }),
        ])

        const preview = await getInactivityPreview(180, NOW)

        expect(preview.failedWarnings).toEqual([{ id: "last", name: "Name of last", stuck: true }])
      })

      it("lists none while warnings are off", async () => {
        given([member("stuck")])
        noticeRows([notice("stuck", { status: "failed", attempts: 9, handledAt: null })])

        await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ failedWarnings: [] })
      })
    })

    it("reads no rows when no member with a share is free of a skip", async () => {
      given([member("u-admin", { isAdmin: true }), member("u-no-share")], ["u-no-share"])

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ rows: [], held: 0, waiting: [], firstWarnings: [] })
      expect(prismaMock.inactivityNotice.findMany).not.toHaveBeenCalled()
      expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    })
  })

  describe("the warning lists", () => {
    // 2026-10-31 12:00 UTC is 08:00 in Toronto: the next run is Nov 1 at 02:17, which sends at 09:00 that day
    const TORONTO_DAY = (day: string) => new Date(`${day}T05:00:00Z`)
    const detail = (userId: string, cycleAt: Date, patch: Record<string, unknown> = {}) => ({
      id: `n-${userId}`,
      userId,
      cycleAt,
      leadDays: 30,
      removeAfter: TORONTO_DAY("2026-11-20"),
      status: "sent",
      code: null,
      attempts: 1,
      zone: "America/Toronto",
      handledAt: daysAgo(20),
      updatedAt: daysAgo(20),
      ...patch,
    })
    const plexWithEmails = (members: InactivityMember[], emails: Record<string, string>) =>
      jest.mocked(getPlexUsers).mockResolvedValue({
        success: true,
        data: members.map((m) => ({ ...plexUser(m.plexUserId!), email: emails[m.id] })),
      })

    it("projects the first warnings of a switch-on while warnings are off, the longest inactive first, spread over the runs", async () => {
      given([member("u-new", { createdAt: daysAgo(300) }), member("u-old", { createdAt: daysAgo(500) }), member("u-recent", { lastSeenAt: daysAgo(10) })])

      const preview = await getInactivityPreview(180, NOW)

      expect(preview.warningsOn).toBe(false)
      // Three members with a share: a scheduled run may remove one, so the second gets the next day
      expect(preview.firstWarnings).toEqual([
        { id: "u-old", name: "Name of u-old", removalDay: "2026-12-01", lastActiveAt: daysAgo(500) },
        { id: "u-new", name: "Name of u-new", removalDay: "2026-12-02", lastActiveAt: daysAgo(300) },
      ])
      expect(preview.waiting).toEqual([])
    })

    it("lists a member with an open warning as waiting, with the newest warning, before they are inactive", async () => {
      const warned = member("u-warned", { lastSeenAt: daysAgo(170) })
      given([warned])
      noticeRows([detail("u-warned", daysAgo(170))] as never)

      const preview = await getInactivityPreview(180, NOW)

      expect(preview.waiting).toEqual([
        {
          id: "u-warned",
          name: "Name of u-warned",
          removalDay: "2026-11-20",
          last: { leadDays: 30, lastWarning: false, status: "sent", code: null, at: daysAgo(20) },
        },
      ])
      expect(preview).toMatchObject({ rows: [], firstWarnings: [], active: 1 })
    })

    it("names each member of the lists the app cannot email by code, never by address", async () => {
      const refused = member("u-refused", { lastSeenAt: daysAgo(170) })
      const members = [member("u-none"), member("u-off"), member("u-ok"), member("u-other"), member("u-disabled"), refused]
      given(members)
      plexWithEmails(members, {
        "u-off": "off@example.com",
        "u-ok": "ok@example.com",
        "u-other": "new@example.com",
        "u-disabled": "disabled@example.com",
        "u-refused": "refused@example.com",
      })
      noticeRows([detail("u-refused", daysAgo(170), { status: "skipped", code: "rejected" })] as never)
      prismaMock.user.findMany.mockResolvedValue([
        buildUser({ id: "u-none", name: "None", email: null }),
        buildUser({ id: "u-off", name: "Off", email: "off@example.com", inactivityEmailsOff: true }),
        buildUser({ id: "u-ok", name: "Ok", email: "OK@example.com" }),
        buildUser({ id: "u-other", name: "Other", email: "old@example.com" }),
        buildUser({ id: "u-disabled", name: "Disabled", email: "disabled@example.com", disabledAt: daysAgo(5) }),
        buildUser({ id: "u-refused", name: "Refused", email: "refused@example.com" }),
      ])

      const preview = await getInactivityPreview(180, NOW)

      expect(preview.cannotEmail).toEqual([
        { id: "u-refused", name: "Refused", code: "rejected", list: "waiting" },
        { id: "u-disabled", name: "Disabled", code: "disabled", list: "first" },
        { id: "u-none", name: "None", code: "no_email", list: "first" },
        { id: "u-off", name: "Off", code: "unsubscribed", list: "first" },
        { id: "u-other", name: "Other", code: "email_unconfirmed", list: "first" },
      ])
      expect(JSON.stringify(preview.cannotEmail)).not.toContain("@")
    })

    it("names a member without a name as Unknown member in the warning lists, never by their address", async () => {
      const members = [member("u-noname"), member("u-waiting", { lastSeenAt: daysAgo(170) })]
      given(members)
      plexWithEmails(members, { "u-waiting": "waiting@example.com" })
      noticeRows([detail("u-waiting", daysAgo(170))] as never)
      prismaMock.user.findMany.mockResolvedValue([
        buildUser({ id: "u-noname", name: null, email: "member" }),
        buildUser({ id: "u-waiting", name: "", email: "waiting@example.com" }),
      ])

      const preview = await getInactivityPreview(180, NOW)

      expect(preview.firstWarnings).toEqual([expect.objectContaining({ id: "u-noname", name: "Unknown member" })])
      expect(preview.waiting).toEqual([expect.objectContaining({ id: "u-waiting", name: "Unknown member" })])
      expect(preview.cannotEmail).toEqual([{ id: "u-noname", name: "Unknown member", code: "invalid_email", list: "first" }])
      // The list of whom a run would remove keeps its fallback to the stored value
      expect(preview.rows).toEqual([expect.objectContaining({ id: "u-noname", name: "member" })])
      expect(JSON.stringify([preview.waiting, preview.firstWarnings, preview.cannotEmail])).not.toMatch(/@|"member"/)
    })

    it("does not check addresses against plex.tv when its list could not be read", async () => {
      jest.mocked(listInactivityMembers).mockResolvedValue([member("u-1")])
      jest.mocked(getPlexUsers).mockResolvedValue({ success: false, status: 503, error: "Unavailable" })

      const preview = await getInactivityPreview(180, NOW)

      expect(preview.firstWarnings.map((row) => row.id)).toEqual(["u-1"])
      expect(preview.cannotEmail).toEqual([])
    })

    it("says when warnings are on", async () => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))
      given([member("u-1")])

      await expect(getInactivityPreview(180, NOW)).resolves.toMatchObject({ warningsOn: true, rows: [], held: 1, firstWarnings: [{ id: "u-1" }] })
    })
  })
})
