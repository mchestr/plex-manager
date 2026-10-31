/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/inactivity/settings", () => ({ ...jest.requireActual("@/lib/inactivity/settings"), getInactivitySettings: jest.fn() }))
jest.mock("@/lib/inactivity/sync", () => ({ syncLastSeen: jest.fn() }))
jest.mock("@/lib/inactivity/sweep", () => ({ runSweep: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { buildInactivityRun, buildInactivitySettings } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { CLAIM_STALE_MS, isRunInProgress, KEPT_RUNS, runMemberActivity } from "@/lib/inactivity/run"
import { getInactivitySettings } from "@/lib/inactivity/settings"
import { runSweep, type SweepResult } from "@/lib/inactivity/sweep"
import { syncLastSeen } from "@/lib/inactivity/sync"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

const now = new Date("2026-10-31T02:17:00.000Z")
const newestPlayAt = new Date("2026-10-30T20:00:00.000Z")
const swept: SweepResult = {
  qualified: 2,
  removed: 1,
  failed: 1,
  blocked: null,
  entries: [{ userId: "u1", outcome: "removed", lastActiveAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null }],
}

function settings(enabled: boolean, thresholdDays = 180) {
  jest.mocked(getInactivitySettings).mockResolvedValue({ enabled, thresholdDays })
}

/** The data the run row was finished with. */
const finished = () => prismaMock.inactivityRun.update.mock.calls[0]![0].data

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  settings(false)
  prismaMock.inactivitySettings.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.inactivityRun.create.mockResolvedValue(buildInactivityRun({ id: "run-1" }))
  prismaMock.inactivityRun.findMany.mockResolvedValue([])
  jest.mocked(syncLastSeen).mockResolvedValue({ ok: true, tautulliUsers: 12, matched: 9, newestPlayAt })
  jest.mocked(runSweep).mockResolvedValue({ qualified: 0, removed: 0, failed: 0, entries: [], blocked: "disabled" })
  jest.mocked(recordAuditEvent).mockResolvedValue(undefined)
})

describe("isRunInProgress", () => {
  it.each([
    ["no settings row", null, false],
    ["no claim", buildInactivitySettings({ runStartedAt: null }), false],
    ["a claim taken a minute ago", buildInactivitySettings({ runStartedAt: new Date(now.getTime() - 60_000) }), true],
    ["a claim left behind for 30 minutes", buildInactivitySettings({ runStartedAt: new Date(now.getTime() - CLAIM_STALE_MS) }), false],
  ])("is %s: %p", async (_case, row, expected) => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(row)

    await expect(isRunInProgress(now)).resolves.toBe(expected)
    expect(prismaMock.inactivitySettings.findUnique).toHaveBeenCalledWith({ where: { id: "inactivity" }, select: { runStartedAt: true } })
  })

  it("reads the clock by default", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ runStartedAt: new Date() }))

    await expect(isRunInProgress()).resolves.toBe(true)
  })
})

describe("runMemberActivity claim", () => {
  it("claims the run on the settings row, taking over a claim older than 30 minutes", async () => {
    await runMemberActivity("scheduled", { actorId: "system", now })

    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith({ where: { id: "inactivity" }, create: { id: "inactivity" }, update: {} })
    expect(prismaMock.inactivitySettings.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "inactivity", OR: [{ runStartedAt: null }, { runStartedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }] },
      data: { runStartedAt: now },
    })
    expect(CLAIM_STALE_MS).toBe(30 * 60 * 1000)
  })

  it("does nothing and records nothing while another run holds the claim", async () => {
    prismaMock.inactivitySettings.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(runMemberActivity("admin", { actorId: "admin-1", now })).resolves.toEqual({ busy: true })
    expect(prismaMock.inactivityRun.create).not.toHaveBeenCalled()
    expect(syncLastSeen).not.toHaveBeenCalled()
    expect(prismaMock.inactivitySettings.updateMany).toHaveBeenCalledTimes(1)
  })

  it("releases only its own claim when it finishes", async () => {
    await runMemberActivity("scheduled", { actorId: "system", now })

    expect(prismaMock.inactivitySettings.updateMany).toHaveBeenLastCalledWith({
      where: { id: "inactivity", runStartedAt: now },
      data: { runStartedAt: null },
    })
  })

  it("releases the claim when the run throws", async () => {
    const thrown = new Error("database down")
    jest.mocked(runSweep).mockRejectedValueOnce(thrown)

    await expect(runMemberActivity("scheduled", { actorId: "system", now })).rejects.toBe(thrown)
    expect(prismaMock.inactivitySettings.updateMany).toHaveBeenLastCalledWith({
      where: { id: "inactivity", runStartedAt: now },
      data: { runStartedAt: null },
    })
  })

  it("uses the current time by default", async () => {
    await runMemberActivity("scheduled", { actorId: "system" })
    expect(prismaMock.inactivitySettings.updateMany.mock.calls[0]![0].data).toEqual({ runStartedAt: expect.any(Date) })
  })
})

describe("runMemberActivity", () => {
  it("creates the run row first, reads last seen, then sweeps with this read as the only fresh one", async () => {
    settings(true, 90)
    const signal = new AbortController().signal

    await runMemberActivity("admin", { actorId: "admin-1", confirmedRemovals: 3, signal, now })

    expect(prismaMock.inactivityRun.create).toHaveBeenCalledWith({ data: { trigger: "admin", startedAt: now, entries: [] }, select: { id: true } })
    expect(syncLastSeen).toHaveBeenCalledWith({ now, signal })
    expect(runSweep).toHaveBeenCalledWith({
      runId: "run-1",
      trigger: "admin",
      actorId: "admin-1",
      confirmedRemovals: 3,
      settings: { enabled: true, thresholdDays: 90 },
      now,
      signal,
      readSince: now,
      newestPlayAt,
    })
  })

  it("stores the counts and entries, and returns them", async () => {
    settings(true)
    jest.mocked(runSweep).mockResolvedValue(swept)

    const result = await runMemberActivity("scheduled", { actorId: "system", now })

    expect(finished()).toEqual({
      finishedAt: expect.any(Date),
      tautulliUsers: 12,
      matched: 9,
      qualified: 2,
      removed: 1,
      failed: 1,
      blocked: null,
      error: null,
      entries: swept.entries,
    })
    expect(prismaMock.inactivityRun.update.mock.calls[0]![0].where).toEqual({ id: "run-1" })
    expect(result).toEqual({ busy: false, runId: "run-1", matched: 9, qualified: 2, removed: 1, failed: 1, blocked: null, error: null })
  })

  it("keeps the newest 30 runs", async () => {
    prismaMock.inactivityRun.findMany.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }] as never)

    await runMemberActivity("scheduled", { actorId: "system", now })

    expect(prismaMock.inactivityRun.findMany).toHaveBeenCalledWith({ orderBy: { startedAt: "desc" }, skip: KEPT_RUNS, select: { id: true } })
    expect(prismaMock.inactivityRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["old-1", "old-2"] } } })
    expect(KEPT_RUNS).toBe(30)
  })

  it("deletes nothing with 30 runs or fewer", async () => {
    await runMemberActivity("scheduled", { actorId: "system", now })
    expect(prismaMock.inactivityRun.deleteMany).not.toHaveBeenCalled()
  })

  it("blocks the sweep when the read fails, and stores why", async () => {
    settings(true)
    jest.mocked(syncLastSeen).mockResolvedValue({ ok: false, code: "TIMEOUT" })

    const result = await runMemberActivity("scheduled", { actorId: "system", now })

    expect(runSweep).not.toHaveBeenCalled()
    expect(finished()).toMatchObject({ tautulliUsers: 0, matched: 0, qualified: 0, removed: 0, blocked: "sync_failed", error: "TIMEOUT", entries: [] })
    expect(result).toMatchObject({ matched: 0, blocked: "sync_failed", error: "TIMEOUT" })
  })

  it("records nothing for a scheduled run without Tautulli while the sweep is off", async () => {
    jest.mocked(syncLastSeen).mockResolvedValue({ ok: false, code: "NO_TAUTULLI" })

    await expect(runMemberActivity("scheduled", { actorId: "system", now })).resolves.toBeNull()

    expect(prismaMock.inactivityRun.delete).toHaveBeenCalledWith({ where: { id: "run-1" } })
    expect(prismaMock.inactivityRun.update).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
    expect(prismaMock.inactivitySettings.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { runStartedAt: null } }))
  })

  it.each([
    ["a scheduled run while the sweep is on", "scheduled", true],
    ["an admin run", "admin", false],
  ] as const)("records a missing Tautulli for %s", async (_name, trigger, enabled) => {
    settings(enabled)
    jest.mocked(syncLastSeen).mockResolvedValue({ ok: false, code: "NO_TAUTULLI" })

    await expect(runMemberActivity(trigger, { actorId: "admin-1", now })).resolves.toMatchObject({ error: "NO_TAUTULLI", blocked: "sync_failed" })
    expect(prismaMock.inactivityRun.delete).not.toHaveBeenCalled()
    expect(finished()).toMatchObject({ error: "NO_TAUTULLI", blocked: "sync_failed" })
  })
})

describe("runMemberActivity audit", () => {
  it("writes INACTIVITY_SWEEP_RUN for every run while the sweep is on", async () => {
    settings(true, 120)
    jest.mocked(runSweep).mockResolvedValue({ ...swept, blocked: "over_limit" })

    await runMemberActivity("scheduled", { actorId: "system", now })

    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_SWEEP_RUN, "system", {
      runId: "run-1",
      trigger: "scheduled",
      thresholdDays: 120,
      qualified: 2,
      removed: 1,
      failed: 1,
      blocked: "over_limit",
    })
  })

  it("writes it for an admin run while the sweep is off", async () => {
    await runMemberActivity("admin", { actorId: "admin-1", now })

    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.INACTIVITY_SWEEP_RUN,
      "admin-1",
      expect.objectContaining({ runId: "run-1", trigger: "admin", blocked: "disabled" })
    )
  })

  it("writes nothing for the daily read while the sweep is off", async () => {
    await runMemberActivity("scheduled", { actorId: "system", now })
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it("keeps the stored run when the audit row fails", async () => {
    settings(true)
    jest.mocked(recordAuditEvent).mockRejectedValueOnce(new Error("database down"))

    await expect(runMemberActivity("scheduled", { actorId: "system", now })).resolves.toMatchObject({ busy: false, runId: "run-1" })
    expect(prismaMock.inactivityRun.update).toHaveBeenCalled()
  })
})
