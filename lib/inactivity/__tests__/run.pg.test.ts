/**
 * @jest-environment node
 */

/**
 * One admin member activity run on PostgreSQL: the last seen read, then the
 * inactivity sweep. Four members share the server: one inactive, one active
 * whose Tautulli lost history, one excluded and one admin. Only the inactive
 * member loses access; last seen never moves back; the run, its
 * `MEMBER_UNSHARED` and `INACTIVITY_SWEEP_RUN` rows are stored; the claim is
 * released.
 *
 * Tautulli and Plex are mocked; the database work, the offboarding and the
 * audit rows are real. Gated by `describePg` and run only by
 * `npm run test:integration`. The suite touches only rows it created, keyed
 * by its own run prefix, and puts the shared settings row back as it found it.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { getPlexUsers, unshareUserFromPlexServer } from "@/lib/connections/plex"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { getActiveService } from "@/lib/data/active-service"
import { PrismaClient, type InactivitySettings } from "@/lib/generated/prisma/client"
import { runMemberActivity } from "@/lib/inactivity/run"
import { AuditEventType } from "@/lib/security/audit-log"

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
jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn(), unshareUserFromPlexServer: jest.fn() }))

const RUN = `inact-${randomUUID().slice(0, 8)}`
const ADMIN = `${RUN}-admin`
const DAY = 86_400_000
const now = Date.now()
const daysAgo = (days: number) => new Date(now - days * DAY)
const seconds = (date: Date) => Math.floor(date.getTime() / 1000)
/** Plex account ids no other suite uses: Tautulli's `user_id` is numeric. */
const plexBase = 8_000_000_000 + Math.floor(Math.random() * 1_000_000) * 10
const plexId = (n: number) => String(plexBase + n)

const MEMBERS = {
  inactive: { id: `${RUN}-inactive`, plexUserId: plexId(1), lastSeenAt: daysAgo(400) },
  active: { id: `${RUN}-active`, plexUserId: plexId(2), lastSeenAt: daysAgo(3) },
  excluded: { id: `${RUN}-excluded`, plexUserId: plexId(3), lastSeenAt: null, inactivityExcluded: true },
  admin: { id: ADMIN, plexUserId: plexId(4), lastSeenAt: null, isAdmin: true },
}
const IDS = Object.values(MEMBERS).map((member) => member.id)
const runIds: string[] = []

/** Tautulli's rows: the active member's play is older than the stored one; a guest played yesterday. */
const TAUTULLI_ROWS = [
  { user_id: Number(plexId(1)), last_seen: seconds(daysAgo(400)), keep_history: 1, email: "inactive@example.com" },
  { user_id: Number(plexId(2)), last_seen: seconds(daysAgo(300)), keep_history: 1 },
  { user_id: Number(plexId(3)), last_seen: seconds(daysAgo(500)), keep_history: 1 },
  { user_id: Number(plexId(4)), last_seen: seconds(daysAgo(600)), keep_history: 1 },
  { user_id: Number(plexId(9)), last_seen: seconds(daysAgo(1)), keep_history: 1 },
]

function plexUser(id: string): PlexTvUser {
  return { id, username: id, title: id, home: false, restricted: false, servers: [{ machineIdentifier: `${RUN}-machine`, shareId: `share-${id}`, owned: false, pending: false }] }
}

describePg("member activity run", (databaseUrl) => {
  let settingsBefore: InactivitySettings | null = null

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    settingsBefore = await mockDb.inactivitySettings.findUnique({ where: { id: "inactivity" } })
    await mockDb.inactivitySettings.upsert({
      where: { id: "inactivity" },
      create: { id: "inactivity", enabled: true, thresholdDays: 180 },
      update: { enabled: true, thresholdDays: 180, runStartedAt: null },
    })
    for (const member of Object.values(MEMBERS)) {
      await mockDb.user.create({ data: { ...member, name: member.id, createdAt: daysAgo(1000), plexAuthToken: "member-token" } })
    }

    jest.mocked(getActiveService).mockImplementation((async (kind: string) =>
      kind === "tautulli"
        ? { id: `${RUN}-tautulli`, url: "http://tautulli.local:8181", apiKey: "k" }
        : { id: `${RUN}-plex`, url: "https://plex.local:32400", token: "server-token", machineIdentifier: `${RUN}-machine`, adminPlexUserId: plexId(99) }) as never)
    jest.mocked(tautulliCommand).mockImplementation(async (_config, _cmd, _params, schema) => ({
      ok: true,
      data: schema.parse({ recordsFiltered: TAUTULLI_ROWS.length, recordsTotal: TAUTULLI_ROWS.length, draw: 1, data: TAUTULLI_ROWS }),
    }))
    jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: [1, 2, 3, 4].map((n) => plexUser(plexId(n))) })
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "removed" })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.auditLog.deleteMany({ where: { OR: [{ targetUserId: { in: IDS } }, { actorUserId: ADMIN }] } })
    await mockDb.inactivityRun.deleteMany({ where: { id: { in: runIds } } })
    await mockDb.user.deleteMany({ where: { id: { in: IDS } } })
    if (settingsBefore) {
      const { id, enabled, thresholdDays, runStartedAt, updatedBy } = settingsBefore
      await mockDb.inactivitySettings.update({ where: { id }, data: { enabled, thresholdDays, runStartedAt, updatedBy } })
    } else {
      await mockDb.inactivitySettings.deleteMany({ where: { id: "inactivity" } })
    }
    await mockDb.$disconnect()
  })

  it("removes only the inactive member, records the run and its audit rows, and releases the claim", async () => {
    const result = await runMemberActivity("admin", { actorId: ADMIN, confirmedRemovals: 1 })

    expect(result).toMatchObject({ busy: false, qualified: 1, removed: 1, failed: 0, blocked: null, error: null })
    const runId = result && !result.busy ? result.runId : ""
    runIds.push(runId)

    expect(unshareUserFromPlexServer).toHaveBeenCalledTimes(1)
    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(expect.objectContaining({ machineIdentifier: `${RUN}-machine` }), plexId(1))

    const users = await mockDb.user.findMany({ where: { id: { in: IDS } }, select: { id: true, lastSeenAt: true, lastSeenReadAt: true, plexAuthToken: true, sessionVersion: true } })
    const byId = Object.fromEntries(users.map((user) => [user.id, user]))
    // Offboarded: token cleared and sessions ended, for the removed member only
    expect(byId[MEMBERS.inactive.id]).toMatchObject({ plexAuthToken: null, sessionVersion: 1 })
    expect(byId[MEMBERS.active.id]).toMatchObject({ plexAuthToken: "member-token", sessionVersion: 0 })
    // Last seen never moves back: Tautulli's older play did not replace the stored one
    expect(byId[MEMBERS.active.id]!.lastSeenAt).toEqual(MEMBERS.active.lastSeenAt)
    expect(byId[MEMBERS.excluded.id]!.lastSeenAt).toEqual(new Date(seconds(daysAgo(500)) * 1000))
    for (const user of users) expect(user.lastSeenReadAt).toEqual(expect.any(Date))

    const run = await mockDb.inactivityRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run).toMatchObject({ trigger: "admin", matched: 4, qualified: 1, removed: 1, failed: 0, blocked: null, error: null, finishedAt: expect.any(Date) })
    expect(run.tautulliUsers).toBe(TAUTULLI_ROWS.length)
    expect(run.entries).toEqual([
      { userId: MEMBERS.inactive.id, outcome: "removed", lastActiveAt: MEMBERS.inactive.lastSeenAt.toISOString(), lastSeenAt: MEMBERS.inactive.lastSeenAt.toISOString() },
    ])
    expect(JSON.stringify(run.entries)).not.toContain("example.com")

    const unshared = await mockDb.auditLog.findMany({ where: { type: AuditEventType.MEMBER_UNSHARED, targetUserId: { in: IDS } } })
    expect(unshared).toHaveLength(1)
    expect(unshared[0]).toMatchObject({ actorUserId: ADMIN, targetUserId: MEMBERS.inactive.id })
    expect(unshared[0]!.details).toMatchObject({ status: "removed", reason: "inactivity", runId, thresholdDays: 180 })

    const sweepRun = await mockDb.auditLog.findMany({ where: { type: AuditEventType.INACTIVITY_SWEEP_RUN, actorUserId: ADMIN } })
    expect(sweepRun).toHaveLength(1)
    expect(sweepRun[0]!.details).toMatchObject({ runId, trigger: "admin", qualified: 1, removed: 1, failed: 0, blocked: null })

    const settings = await mockDb.inactivitySettings.findUniqueOrThrow({ where: { id: "inactivity" } })
    expect(settings.runStartedAt).toBeNull()
  })

  it("removes no one on a second run: the removed member no longer has a share", async () => {
    jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: [2, 3, 4].map((n) => plexUser(plexId(n))) })
    jest.mocked(unshareUserFromPlexServer).mockClear()

    const result = await runMemberActivity("admin", { actorId: ADMIN, confirmedRemovals: 0 })

    expect(result).toMatchObject({ busy: false, qualified: 0, removed: 0, blocked: null })
    if (result && !result.busy) runIds.push(result.runId)
    expect(unshareUserFromPlexServer).not.toHaveBeenCalled()
    const unshared = await mockDb.auditLog.count({ where: { type: AuditEventType.MEMBER_UNSHARED, targetUserId: { in: IDS } } })
    expect(unshared).toBe(1)
  })
})
