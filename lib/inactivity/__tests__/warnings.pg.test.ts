/**
 * @jest-environment node
 */

/**
 * Warning emails before removal, on PostgreSQL: member activity runs plan
 * notice rows once (a second run on the same day adds none) and hand the
 * pending ones to the enqueuer; two planners at once store one row per key;
 * the removal gate holds a member until the last warning is 12 hours old and
 * then removes them; a member whose plex.tv account shows no email gets
 * every warning skipped and is removed on the same timeline; with warnings off, a date a sent warning named still
 * holds; and the retention sweep deletes old rows of closed cycles only.
 *
 * Tautulli, Plex, Stripe and the Discord role sync are mocked; the runs, the
 * notice rows, the offboarding and the audit rows are real. Gated by
 * `describePg`. The suite touches only rows it created, keyed by its own run
 * prefix, and puts the shared settings row back as it found it.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { getPlexUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { getActiveService } from "@/lib/data/active-service"
import { PrismaClient, type InactivitySettings } from "@/lib/generated/prisma/client"
import { startOfDay } from "@/lib/inactivity/notices"
import { runMemberActivity } from "@/lib/inactivity/run"
import { runWarningStep } from "@/lib/inactivity/warn"
import { listInactivityMembers } from "@/lib/inactivity/members"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { dayKey } from "@/lib/utils/zoned-time"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ ...jest.requireActual("@/lib/email/config"), emailConfigured: jest.fn(() => true) }))
jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn(), unshareUserFromPlexServer: jest.fn() }))
jest.mock("@/lib/connections/plex-user-access", () => ({ checkUserServerAccess: jest.fn() }))
jest.mock("@/lib/stripe/client", () => ({ getStripe: jest.fn(async () => null) }))
jest.mock("@/lib/discord/role-sync", () => ({ enqueueRoleSync: jest.fn() }))

const RUN = `warn-${randomUUID().slice(0, 8)}`
const ADMIN = `${RUN}-admin`
const TORONTO = "America/Toronto"
const HOUR = 3_600_000
const DAY = 24 * HOUR
const realNow = Date.now()
const daysAgo = (days: number) => new Date(realNow - days * DAY)
const seconds = (date: Date) => Math.floor(date.getTime() / 1000)
const plexBase = 8_100_000_000 + Math.floor(Math.random() * 1_000_000) * 10
const plexId = (n: number) => String(plexBase + n)
/** 00:00 in Toronto, `days` days from today there. */
const midnightIn = (days: number) => startOfDay(dayKey(realNow + days * DAY, TORONTO), TORONTO)

const LAST_PLAY = daysAgo(400)
const MEMBERS = {
  confirmed: { id: `${RUN}-confirmed`, plexUserId: plexId(1), email: "confirmed@example.com" },
  unconfirmed: { id: `${RUN}-unconfirmed`, plexUserId: plexId(2), email: "old@example.com" },
}
const IDS = [...Object.values(MEMBERS).map((member) => member.id), ADMIN]
const runIds: string[] = []

/** The simulated clock the Tautulli mock reads: someone played an hour before it. */
let clock = new Date(realNow)

function plexUser(id: string, email: string): PlexTvUser {
  return { id, username: id, title: id, email, home: false, restricted: false, servers: [{ machineIdentifier: `${RUN}-machine`, shareId: `share-${id}`, owned: false, pending: false }] }
}

function shareWith(...members: { plexUserId: string; email: string }[]) {
  jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: members.map((member) => plexUser(member.plexUserId, member.email)) })
}

async function run(now: Date, confirmedUserIds: string[] = [], enqueueNotices = jest.fn(async () => undefined)) {
  clock = now
  const result = await runMemberActivity("admin", { actorId: ADMIN, confirmedUserIds, enqueueNotices, now })
  if (result && !result.busy) runIds.push(result.runId)
  return { result, enqueueNotices }
}

const notices = (userId: string) => mockDb.inactivityNotice.findMany({ where: { userId }, orderBy: [{ removeAfter: "asc" }, { leadDays: "desc" }] })

describePg("inactivity warning emails", (databaseUrl) => {
  let settingsBefore: InactivitySettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    settingsBefore = await mockDb.inactivitySettings.findUnique({ where: { id: "inactivity" } })
    await mockDb.inactivitySettings.upsert({
      where: { id: "inactivity" },
      create: { id: "inactivity", enabled: true, thresholdDays: 180, warningsEnabled: true, warningDays: [30, 7, 1] },
      update: { enabled: true, thresholdDays: 180, warningsEnabled: true, warningDays: [30, 7, 1], runStartedAt: null },
    })
    await mockDb.user.create({ data: { id: ADMIN, name: ADMIN, isAdmin: true, plexUserId: plexId(9) } })
    for (const member of Object.values(MEMBERS)) {
      await mockDb.user.create({ data: { ...member, name: member.id, timezone: TORONTO, lastSeenAt: LAST_PLAY, createdAt: daysAgo(1000), plexAuthToken: "member-token" } })
    }

    jest.mocked(getActiveService).mockImplementation((async (kind: string) =>
      kind === "tautulli"
        ? { id: `${RUN}-tautulli`, url: "http://tautulli.local:8181", apiKey: "k" }
        : { id: `${RUN}-plex`, url: "https://plex.local:32400", token: "server-token", machineIdentifier: `${RUN}-machine`, adminPlexUserId: plexId(99) }) as never)
    jest.mocked(tautulliCommand).mockImplementation(async (_config, cmd, _params, schema) => {
      const rows = [
        ...Object.values(MEMBERS).map((member) => ({ user_id: Number(member.plexUserId), last_seen: seconds(LAST_PLAY), keep_history: 1 })),
        { user_id: Number(plexId(8)), last_seen: seconds(new Date(clock.getTime() - HOUR)), keep_history: 1 },
      ]
      const history = { recordsFiltered: 1, recordsTotal: 1, draw: 1, data: [{ date: seconds(daysAgo(2000)), started: seconds(daysAgo(2000)), user: "guest" }] }
      if (cmd === "get_activity") return { ok: true, data: schema.parse({ stream_count: "0", sessions: [] }) }
      return { ok: true, data: schema.parse(cmd === "get_history" ? history : { recordsFiltered: rows.length, recordsTotal: rows.length, draw: 1, data: rows }) }
    })
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "removed" })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.auditLog.deleteMany({ where: { OR: [{ targetUserId: { in: IDS } }, { actorUserId: ADMIN }] } })
    await mockDb.inactivityRun.deleteMany({ where: { id: { in: runIds } } })
    await mockDb.user.deleteMany({ where: { id: { in: IDS } } })
    if (settingsBefore) {
      const { id, enabled, thresholdDays, runStartedAt, updatedBy, warningsEnabled, warningDays } = settingsBefore
      await mockDb.inactivitySettings.update({ where: { id }, data: { enabled, thresholdDays, runStartedAt, updatedBy, warningsEnabled, warningDays } })
    } else {
      await mockDb.inactivitySettings.deleteMany({ where: { id: "inactivity" } })
    }
    await mockDb.$disconnect()
  })

  beforeEach(async () => {
    await mockDb.inactivityNotice.deleteMany({ where: { userId: { in: IDS } } })
    await mockDb.inactivitySettings.update({ where: { id: "inactivity" }, data: { warningsEnabled: true } })
    jest.mocked(unshareUserFromPlexServer).mockClear()
    shareWith(MEMBERS.confirmed, { ...MEMBERS.unconfirmed, email: "new@example.com" })
  })

  it("plans first warnings once a day, skips an address plex.tv does not confirm, and hands the pending rows on", async () => {
    const now = new Date(realNow)
    const first = await run(now)

    expect(first.result).toMatchObject({ busy: false, warned: 2, qualified: 0, removed: 0, blocked: null })
    const [confirmed] = await notices(MEMBERS.confirmed.id)
    const [unconfirmed] = await notices(MEMBERS.unconfirmed.id)
    expect(confirmed).toMatchObject({ status: "pending", leadDays: 30, cycleAt: LAST_PLAY, zone: TORONTO, runId: first.result && !first.result.busy ? first.result.runId : "" })
    expect(unconfirmed).toMatchObject({ status: "skipped", code: "email_unconfirmed", leadDays: 30, handledAt: now })
    expect(first.enqueueNotices).toHaveBeenCalledWith([confirmed!.id])
    const stored = await mockDb.inactivityRun.findUniqueOrThrow({ where: { id: runIds.at(-1)! } })
    expect(stored).toMatchObject({ warned: 2, newestPlayAt: new Date(seconds(new Date(now.getTime() - HOUR)) * 1000) })

    const second = await run(new Date(now.getTime() + HOUR))
    expect(second.result).toMatchObject({ warned: 0 })
    expect(second.enqueueNotices).toHaveBeenCalledWith([confirmed!.id])
    await expect(mockDb.inactivityNotice.count({ where: { userId: { in: IDS } } })).resolves.toBe(2)
  })

  it("skips every warning of a member whose plex.tv account shows no email, and removes them on the same timeline", async () => {
    jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: [{ ...plexUser(MEMBERS.unconfirmed.plexUserId, ""), email: undefined }] })
    const first = await run(new Date(realNow))
    expect(first.result).toMatchObject({ warned: 1, removed: 0 })
    const [planned] = await notices(MEMBERS.unconfirmed.id)
    expect(planned).toMatchObject({ status: "skipped", code: "email_unconfirmed", leadDays: 30 })
    expect(first.enqueueNotices).not.toHaveBeenCalled()

    const date = planned!.removeAfter
    await run(new Date(date.getTime() - 7 * DAY + 3 * HOUR))
    await run(new Date(date.getTime() - DAY + 3 * HOUR))
    const removal = await run(new Date(date.getTime() + 3 * HOUR), [MEMBERS.unconfirmed.id])

    const rows = await notices(MEMBERS.unconfirmed.id)
    expect(rows.map(({ leadDays, status, code }) => ({ leadDays, status, code }))).toEqual(
      [30, 7, 1].map((leadDays) => ({ leadDays, status: "skipped", code: "email_unconfirmed" }))
    )
    expect(removal.result).toMatchObject({ qualified: 1, removed: 1, blocked: null })
    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(expect.anything(), MEMBERS.unconfirmed.plexUserId)
    // Back for the other tests: shared again, with access
    await mockDb.user.update({ where: { id: MEMBERS.unconfirmed.id }, data: { accessEndedAt: null } })
  })

  it("stores one row per key when two planners run at once", async () => {
    const members = (await listInactivityMembers()).filter((member) => member.id === MEMBERS.confirmed.id)
    const step = () =>
      runWarningStep({
        runId: `${RUN}-step`,
        members,
        sharedMembers: 2,
        settings: { thresholdDays: 180 },
        warnings: { warningDays: [30, 7, 1], serverZone: TORONTO },
        now: new Date(realNow),
        newestPlayAt: new Date(realNow - HOUR),
        plexEmails: new Map([[MEMBERS.confirmed.plexUserId, MEMBERS.confirmed.email]]),
        enqueueNotices: async () => undefined,
      })

    const [a, b] = await Promise.all([step(), step()])

    expect(a + b).toBe(1)
    await expect(mockDb.inactivityNotice.count({ where: { userId: MEMBERS.confirmed.id } })).resolves.toBe(1)
  })

  it("holds the removal until the last warning is 12 hours old, then removes the member", async () => {
    shareWith(MEMBERS.confirmed)
    const date = midnightIn(3)
    const lastWarning = new Date(date.getTime() - 6 * HOUR)
    const row = { userId: MEMBERS.confirmed.id, cycleAt: LAST_PLAY, removeAfter: date, zone: TORONTO, status: "sent" }
    await mockDb.inactivityNotice.createMany({
      data: [
        { ...row, leadDays: 30, handledAt: new Date(date.getTime() - 30 * DAY) },
        { ...row, leadDays: 7, handledAt: new Date(date.getTime() - 7 * DAY) },
        { ...row, leadDays: 1, handledAt: lastWarning },
      ],
    })

    const early = await run(new Date(date.getTime() + 2 * HOUR), [MEMBERS.confirmed.id])
    expect(early.result).toMatchObject({ qualified: 0, removed: 0, warned: 0, blocked: null })
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()

    const later = await run(new Date(date.getTime() + 26 * HOUR), [MEMBERS.confirmed.id])
    expect(later.result).toMatchObject({ qualified: 1, removed: 1, blocked: null })
    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(expect.anything(), MEMBERS.confirmed.plexUserId)
  })

  it("keeps a date a sent warning named after warnings are turned off", async () => {
    shareWith({ ...MEMBERS.unconfirmed, email: "new@example.com" })
    await mockDb.inactivitySettings.update({ where: { id: "inactivity" }, data: { warningsEnabled: false } })
    const date = midnightIn(5)
    await mockDb.inactivityNotice.create({
      data: { userId: MEMBERS.unconfirmed.id, cycleAt: LAST_PLAY, removeAfter: date, zone: TORONTO, leadDays: 30, status: "sent", handledAt: new Date(realNow - DAY) },
    })

    const before = await run(new Date(date.getTime() - HOUR), [MEMBERS.unconfirmed.id])
    expect(before.result).toMatchObject({ qualified: 0, removed: 0, warned: 0 })
    expect(before.enqueueNotices).not.toHaveBeenCalled()

    const on = await run(new Date(date.getTime() + HOUR), [MEMBERS.unconfirmed.id])
    expect(on.result).toMatchObject({ qualified: 1, removed: 1 })
  })

  it("deletes old rows of closed cycles only, and keeps rows of an open cycle at any age", async () => {
    const old = daysAgo(400)
    const row = { userId: MEMBERS.confirmed.id, removeAfter: daysAgo(300), zone: TORONTO, leadDays: 30, status: "sent", createdAt: old }
    // The confirmed member was removed above, so their cycle closed after the rows were made; the other is still open
    await mockDb.user.update({ where: { id: MEMBERS.confirmed.id }, data: { accessEndedAt: daysAgo(10) } })
    await mockDb.user.update({ where: { id: MEMBERS.unconfirmed.id }, data: { accessEndedAt: null } })
    await mockDb.inactivityNotice.createMany({
      data: [
        { ...row, cycleAt: LAST_PLAY, id: `${RUN}-closed-old` },
        { ...row, cycleAt: LAST_PLAY, leadDays: 7, createdAt: daysAgo(20), id: `${RUN}-closed-young` },
        { ...row, userId: MEMBERS.unconfirmed.id, cycleAt: LAST_PLAY, id: `${RUN}-open-old` },
        { ...row, userId: MEMBERS.unconfirmed.id, cycleAt: daysAgo(900), leadDays: 1, id: `${RUN}-earlier-cycle` },
      ],
    })

    const result = await runRetentionSweep({ now: new Date(realNow) })

    expect(result.counts.inactivityNotices).toBeGreaterThanOrEqual(2)
    const left = await mockDb.inactivityNotice.findMany({ where: { userId: { in: IDS } }, select: { id: true } })
    expect(left.map((notice) => notice.id).sort()).toEqual([`${RUN}-closed-young`, `${RUN}-open-old`])
  })
})
