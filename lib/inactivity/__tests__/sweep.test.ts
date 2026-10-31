/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))
jest.mock("@/lib/members/unshare", () => ({ ...jest.requireActual("@/lib/members/unshare"), unshareMember: jest.fn() }))
jest.mock("@/lib/locks/access-lock", () => ({ ...jest.requireActual("@/lib/locks/access-lock"), withAccessLock: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn(), getRedisConnection: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { buildPlexServer } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { getActiveService } from "@/lib/data/active-service"
import { runSweep, type SweepOptions } from "@/lib/inactivity/sweep"
import { AccessLockBusyError, withAccessLock } from "@/lib/locks/access-lock"
import { UnshareCleanupError, unshareMember } from "@/lib/members/unshare"
import { getRedisConnection, isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

const NOW = new Date("2026-10-31T02:17:00.000Z")
const DAY = 86_400_000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY)
const MACHINE = "machine-1"
const server = buildPlexServer({ adminPlexUserId: "1", machineIdentifier: MACHINE })

interface MemberRow {
  id: string
  plexUserId: string | null
  isAdmin: boolean
  role: string | null
  isExempt: boolean
  inactivityExcluded: boolean
  createdAt: Date
  lastSeenAt: Date | null
  lastSeenReadAt: Date | null
  subscription: { status: "ACTIVE" | "PAST_DUE" | "CANCELED" } | null
}

/** A member with a Plex account, last seen 400 days ago, found by this read. */
function member(id: string, plexUserId: string | null, patch: Partial<MemberRow> = {}): MemberRow {
  return {
    id,
    plexUserId,
    isAdmin: false,
    role: null,
    isExempt: false,
    inactivityExcluded: false,
    createdAt: daysAgo(1000),
    lastSeenAt: daysAgo(400),
    lastSeenReadAt: NOW,
    subscription: null,
    ...patch,
  }
}

function plexUser(id: string, share: "active" | "pending" | "other" = "active"): PlexTvUser {
  return {
    id,
    username: `user${id}`,
    title: `user${id}`,
    home: false,
    restricted: false,
    servers: [{ machineIdentifier: share === "other" ? "another-machine" : MACHINE, shareId: `share-${id}`, owned: false, pending: share === "pending" }],
  }
}

let stored = new Map<string, MemberRow>()

/** The members the sweep reads, and the same rows when it reads one again. */
function members(...rows: MemberRow[]) {
  stored = new Map(rows.map((row) => [row.id, row]))
  prismaMock.user.findMany.mockResolvedValue(rows as never)
}

/** plex.tv's share list: an accepted share of this server for each id. */
function shares(...ids: string[]) {
  jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: ids.map((id) => plexUser(id)) })
}

const options = (patch: Partial<SweepOptions> = {}): SweepOptions => ({
  runId: "run-1",
  trigger: "admin",
  actorId: "admin-1",
  confirmedRemovals: 10,
  settings: { enabled: true, thresholdDays: 180 },
  now: NOW,
  readSince: NOW,
  newestPlayAt: daysAgo(1),
  ...patch,
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockResolvedValue(server as never)
  jest.mocked(withMachineIdentifier).mockImplementation(async (row) => row)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(unshareMember).mockResolvedValue({ success: true, status: "removed" })
  jest.mocked(recordAuditEvent).mockResolvedValue(undefined)
  prismaMock.user.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => stored.get(where.id) ?? null) as never)
  members()
  shares()
})

describe("runSweep guards", () => {
  it("removes no one and calls nothing while the sweep is off", async () => {
    await expect(runSweep(options({ settings: { enabled: false, thresholdDays: 180 } }))).resolves.toEqual({
      qualified: 0,
      removed: 0,
      failed: 0,
      entries: [],
      blocked: "disabled",
    })
    expect(getActiveService).not.toHaveBeenCalled()
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it.each([
    ["no play at all", null],
    ["no play in over 14 days", new Date(NOW.getTime() - 14 * DAY - 1)],
  ])("blocks a run when Tautulli recorded %s", async (_name, newestPlayAt) => {
    await expect(runSweep(options({ newestPlayAt }))).resolves.toMatchObject({ blocked: "tautulli_stale", removed: 0 })
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it("trusts a play exactly 14 days old", async () => {
    await expect(runSweep(options({ newestPlayAt: daysAgo(14) }))).resolves.toMatchObject({ blocked: null })
  })

  it("blocks a run without a Plex server", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(runSweep(options())).resolves.toMatchObject({ blocked: "no_plex_server" })
    expect(getActiveService).toHaveBeenCalledWith("plex")
  })

  it("blocks a run when the server's machine identifier is unknown", async () => {
    jest.mocked(withMachineIdentifier).mockImplementation(async (row) => ({ ...row, machineIdentifier: null }))
    await expect(runSweep(options())).resolves.toMatchObject({ blocked: "plex_unavailable" })
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it.each<[string, Awaited<ReturnType<typeof getPlexUsers>>, string]>([
    ["refuses the token", { success: false, status: 401 }, "plex_auth"],
    ["is down", { success: false, status: 503 }, "plex_unavailable"],
    ["times out", { success: false }, "plex_unavailable"],
    ["sends no list", { success: true }, "plex_unavailable"],
  ])("blocks a run when plex.tv %s, since access is then unknown", async (_name, answer, block) => {
    members(member("u1", "42"))
    jest.mocked(getPlexUsers).mockResolvedValue(answer)

    await expect(runSweep(options())).resolves.toMatchObject({ blocked: block, qualified: 0 })
    expect(getPlexUsers).toHaveBeenCalledWith("plex-token")
    expect(unshareMember).not.toHaveBeenCalled()
  })
})

describe("runSweep candidates", () => {
  it("considers only members with an accepted share of this server who are inactive and unprotected", async () => {
    members(
      member("shared", "10"),
      member("pending", "11"),
      member("other-server", "12"),
      member("no-share", "13"),
      member("active", "14", { lastSeenAt: daysAgo(10) }),
      member("excluded", "15", { inactivityExcluded: true }),
      member("admin", "16", { isAdmin: true }),
      member("owner", "1"),
      member("support", "17", { role: "support" }),
      member("exempt", "18", { isExempt: true }),
      member("paying", "19", { subscription: { status: "PAST_DUE" } }),
      member("not-read", "20", { lastSeenReadAt: daysAgo(1) }),
      member("lapsed", "21", { subscription: { status: "CANCELED" } })
    )
    jest.mocked(getPlexUsers).mockResolvedValue({
      success: true,
      data: [plexUser("10"), plexUser("11", "pending"), plexUser("12", "other"), ...["1", "14", "15", "16", "17", "18", "19", "20", "21"].map((id) => plexUser(id))],
    })

    const result = await runSweep(options())

    expect(result.qualified).toBe(2)
    expect(jest.mocked(unshareMember).mock.calls.map(([target]) => target.id).sort()).toEqual(["lapsed", "shared"])
  })

  it("removes the longest inactive first, counting a member who never played from the day they joined", async () => {
    members(
      member("recent", "1001", { lastSeenAt: daysAgo(200) }),
      member("never-played", "1002", { lastSeenAt: null, createdAt: daysAgo(500) }),
      member("oldest", "1003", { lastSeenAt: daysAgo(900) }),
      member("joined-lately", "1004", { lastSeenAt: null, createdAt: daysAgo(20) })
    )
    shares("1001", "1002", "1003", "1004")

    const result = await runSweep(options())

    expect(result.entries.map((entry) => entry.userId)).toEqual(["oldest", "never-played", "recent"])
    expect(result).toMatchObject({ qualified: 3, removed: 3, failed: 0, blocked: null })
  })

  it("matches a padded Plex id and unshares with the trimmed one", async () => {
    members(member("u1", " 42 "))
    shares("42")

    await runSweep(options())

    expect(unshareMember).toHaveBeenCalledWith({ id: "u1", plexUserId: "42" }, expect.objectContaining({ machineIdentifier: MACHINE }), "admin-1")
  })

  it("never considers a member without a Plex account", async () => {
    members(member("no-plex", null))
    shares("42")

    await expect(runSweep(options())).resolves.toMatchObject({ qualified: 0, removed: 0 })
  })

  it("reads only members with a Plex account", async () => {
    await runSweep(options())
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { plexUserId: { not: null } } }))
  })
})

describe("runSweep limits", () => {
  it("removes no one on a schedule when more qualify than 5% of the members with access", async () => {
    const shared = Array.from({ length: 40 }, (_, index) => member(`u${index}`, String(100 + index), { lastSeenAt: index < 3 ? daysAgo(400) : daysAgo(1) }))
    members(...shared)
    shares(...shared.map((row) => row.plexUserId!))

    await expect(runSweep(options({ trigger: "scheduled", actorId: "system" }))).resolves.toEqual({
      qualified: 3,
      removed: 0,
      failed: 0,
      entries: [],
      blocked: "over_limit",
    })
    expect(unshareMember).not.toHaveBeenCalled()
  })

  it("removes up to the limit on a schedule, as the system", async () => {
    const shared = Array.from({ length: 40 }, (_, index) => member(`u${index}`, String(100 + index), { lastSeenAt: index < 2 ? daysAgo(400) : daysAgo(1) }))
    members(...shared, member("no-access", "999"))
    shares(...shared.map((row) => row.plexUserId!))

    await expect(runSweep(options({ trigger: "scheduled", actorId: "system" }))).resolves.toMatchObject({ qualified: 2, removed: 2, blocked: null })
    expect(jest.mocked(unshareMember).mock.calls.map((call) => call[2])).toEqual(["system", "system"])
  })

  it("lets a schedule remove one member on a small server", async () => {
    members(member("u1", "42"), member("u2", "43", { lastSeenAt: daysAgo(1) }))
    shares("42", "43")

    await expect(runSweep(options({ trigger: "scheduled" }))).resolves.toMatchObject({ qualified: 1, removed: 1, blocked: null })
  })

  it.each([undefined, 1])("removes no one on an admin run when more qualify than the %p confirmed", async (confirmedRemovals) => {
    members(member("u1", "42"), member("u2", "43"))
    shares("42", "43")

    await expect(runSweep(options({ confirmedRemovals }))).resolves.toMatchObject({ qualified: 2, removed: 0, entries: [], blocked: "not_confirmed" })
    expect(unshareMember).not.toHaveBeenCalled()
  })

  it("runs an admin run with nothing to remove even without a confirmed count", async () => {
    members(member("u1", "42", { lastSeenAt: daysAgo(1) }))
    shares("42")

    await expect(runSweep(options({ confirmedRemovals: undefined }))).resolves.toEqual({ qualified: 0, removed: 0, failed: 0, entries: [], blocked: null })
  })
})

describe("runSweep removals", () => {
  beforeEach(() => {
    members(member("u1", "42", { lastSeenAt: new Date("2025-11-01T10:00:00.000Z") }), member("u2", "43", { lastSeenAt: null, createdAt: daysAgo(300) }))
    shares("42", "43")
  })

  it("writes and waits for one MEMBER_UNSHARED per removal, with the reason and the dates it used", async () => {
    jest.mocked(unshareMember).mockResolvedValueOnce({ success: true, status: "removed" }).mockResolvedValueOnce({ success: true, status: "already_removed" })

    const result = await runSweep(options())

    expect(recordAuditEvent).toHaveBeenCalledTimes(2)
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.MEMBER_UNSHARED, "admin-1", {
      targetUserId: "u1",
      status: "removed",
      reason: "inactivity",
      lastSeenAt: "2025-11-01T10:00:00.000Z",
      lastActiveAt: "2025-11-01T10:00:00.000Z",
      thresholdDays: 180,
      runId: "run-1",
    })
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.MEMBER_UNSHARED, "admin-1", {
      targetUserId: "u2",
      status: "already_removed",
      reason: "inactivity",
      lastSeenAt: null,
      lastActiveAt: daysAgo(300).toISOString(),
      thresholdDays: 180,
      runId: "run-1",
    })
    expect(result).toEqual({
      qualified: 2,
      removed: 2,
      failed: 0,
      blocked: null,
      entries: [
        { userId: "u1", outcome: "removed", lastActiveAt: "2025-11-01T10:00:00.000Z", lastSeenAt: "2025-11-01T10:00:00.000Z" },
        { userId: "u2", outcome: "already_removed", lastActiveAt: daysAgo(300).toISOString(), lastSeenAt: null },
      ],
    })
  })

  it.each<[string, Partial<MemberRow> | null, string]>([
    ["now excluded", { inactivityExcluded: true }, "excluded"],
    ["now paying", { subscription: { status: "ACTIVE" } }, "paying"],
    ["now an admin", { isAdmin: true }, "admin"],
    ["back to watching", { lastSeenAt: daysAgo(1) }, "active"],
    ["gone", null, "missing"],
  ])("re-reads a member before removing them and skips one %s", async (_name, patch, code) => {
    const first = stored.get("u1")!
    prismaMock.user.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) =>
      where.id === "u1" ? (patch ? { ...first, ...patch } : null) : (stored.get(where.id) ?? null)) as never)

    const result = await runSweep(options())

    expect(result.entries.find((entry) => entry.userId === "u1")).toMatchObject({ outcome: "skipped", code })
    expect(jest.mocked(unshareMember).mock.calls.map(([target]) => target.id)).toEqual(["u2"])
    expect(result).toMatchObject({ qualified: 2, removed: 1, failed: 0, blocked: null })
  })

  it("goes on after plex.tv does not answer for one member", async () => {
    jest.mocked(unshareMember).mockResolvedValueOnce({ success: false, code: "PLEX_UNAVAILABLE" })

    const result = await runSweep(options())

    expect(result.entries.map((entry) => [entry.userId, entry.outcome, entry.code])).toEqual([
      ["u1", "failed", "PLEX_UNAVAILABLE"],
      ["u2", "removed", undefined],
    ])
    expect(result).toMatchObject({ removed: 1, failed: 1, blocked: null })
    expect(recordAuditEvent).toHaveBeenCalledTimes(1)
  })

  it("stops when plex.tv refuses the token", async () => {
    jest.mocked(unshareMember).mockResolvedValueOnce({ success: false, code: "PLEX_AUTH" })

    const result = await runSweep(options())

    expect(result).toMatchObject({ removed: 0, failed: 1, blocked: "plex_auth" })
    expect(result.entries).toEqual([expect.objectContaining({ userId: "u1", outcome: "failed", code: "PLEX_AUTH" })])
    expect(unshareMember).toHaveBeenCalledTimes(1)
  })

  it("stops when an audit row cannot be written, keeping the removal", async () => {
    jest.mocked(recordAuditEvent).mockRejectedValueOnce(new Error("database down"))

    const result = await runSweep(options())

    expect(result).toMatchObject({ removed: 1, failed: 0, blocked: "audit_failed" })
    expect(result.entries).toEqual([expect.objectContaining({ userId: "u1", outcome: "removed" })])
    expect(unshareMember).toHaveBeenCalledTimes(1)
  })

  it("stops when a removal's clean-up fails, still recording the removal as not offboarded", async () => {
    jest.mocked(unshareMember).mockRejectedValueOnce(new UnshareCleanupError("removed", { cause: new Error("database down") }))

    const result = await runSweep(options())

    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.MEMBER_UNSHARED,
      "admin-1",
      expect.objectContaining({ targetUserId: "u1", status: "removed", reason: "inactivity", runId: "run-1", offboarded: false })
    )
    expect(result).toMatchObject({ removed: 0, failed: 1, blocked: "offboard_failed" })
    expect(result.entries).toEqual([expect.objectContaining({ userId: "u1", outcome: "failed", code: "offboard_failed" })])
  })

  it("still stops on a failed clean-up when its audit row fails too", async () => {
    jest.mocked(unshareMember).mockRejectedValueOnce(new UnshareCleanupError("already_removed", { cause: new Error("down") }))
    jest.mocked(recordAuditEvent).mockRejectedValueOnce(new Error("database down"))

    await expect(runSweep(options())).resolves.toMatchObject({ failed: 1, blocked: "offboard_failed" })
    expect(unshareMember).toHaveBeenCalledTimes(1)
  })

  it("throws any other error from a removal", async () => {
    const thrown = new Error("unexpected")
    jest.mocked(unshareMember).mockRejectedValueOnce(thrown)

    await expect(runSweep(options())).rejects.toBe(thrown)
  })

  it("stops between removals when the server shuts down", async () => {
    const controller = new AbortController()
    jest.mocked(unshareMember).mockImplementationOnce(async () => {
      controller.abort()
      return { success: true, status: "removed" }
    })

    const result = await runSweep(options({ signal: controller.signal }))

    expect(result).toMatchObject({ removed: 1, blocked: "stopped" })
    expect(result.entries).toHaveLength(1)
  })

  it("removes no one when the shutdown came first", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(runSweep(options({ signal: controller.signal }))).resolves.toMatchObject({ qualified: 2, removed: 0, entries: [], blocked: "stopped" })
    expect(unshareMember).not.toHaveBeenCalled()
  })
})

describe("runSweep with Redis", () => {
  const redis = { eval: jest.fn() }

  beforeEach(() => {
    members(member("u1", "42"), member("u2", "43"))
    shares("42", "43")
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(getRedisConnection).mockReturnValue(redis as never)
    jest.mocked(withAccessLock).mockImplementation(async (_userId, _owner, fn) => fn())
  })

  it("removes each member under their access lock", async () => {
    await expect(runSweep(options())).resolves.toMatchObject({ removed: 2 })

    expect(withAccessLock).toHaveBeenCalledWith("u1", "inactivity:run-1", expect.any(Function), { redis, waitMs: 5_000 })
    expect(withAccessLock).toHaveBeenCalledWith("u2", "inactivity:run-1", expect.any(Function), { redis, waitMs: 5_000 })
  })

  it("marks a member whose lock another access change holds as busy, and goes on", async () => {
    jest.mocked(withAccessLock).mockRejectedValueOnce(new AccessLockBusyError("u1"))

    const result = await runSweep(options())

    expect(result.entries.map((entry) => [entry.userId, entry.outcome, entry.code])).toEqual([
      ["u1", "failed", "busy"],
      ["u2", "removed", undefined],
    ])
    expect(result).toMatchObject({ removed: 1, failed: 1, blocked: null })
  })

  it("throws a Redis error from the lock", async () => {
    const thrown = new Error("redis down")
    jest.mocked(withAccessLock).mockRejectedValueOnce(thrown)

    await expect(runSweep(options())).rejects.toBe(thrown)
  })
})
