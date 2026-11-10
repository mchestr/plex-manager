/**
 * @jest-environment node
 */

/**
 * The media cleanup jobs (TS 9.3, architecture-r2-2, architecture-r2-6):
 * each processor path, the chain after a read with its `readStatus`, the dry
 * run after a save, the act job's busy retries (each with its own id), its
 * rounds under one claim, `stillAdmin`, the registry, and results with
 * numbers and codes only.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }) }))
const mockAct = { actStep: jest.fn(), candidatesToday: jest.fn(), stillAdmin: jest.fn() }
jest.mock("@/lib/cleanup/run/act", () => ({ actStep: (...a: unknown[]) => mockAct.actStep(...a), candidatesToday: (...a: unknown[]) => mockAct.candidatesToday(...a),
  stillAdmin: (...a: unknown[]) => mockAct.stillAdmin(...a) }))
const mockRun = { runCleanup: jest.fn(), busyRunRow: jest.fn(), createRunRow: jest.fn(), finishRun: jest.fn() }
jest.mock("@/lib/cleanup/run/run", () => ({ ...jest.requireActual("@/lib/cleanup/run/run"), runCleanup: (...a: unknown[]) => mockRun.runCleanup(...a) }))
jest.mock("@/lib/cleanup/run/run-row", () => ({ busyRunRow: (...a: unknown[]) => mockRun.busyRunRow(...a), createRunRow: (...a: unknown[]) => mockRun.createRunRow(...a),
  finishRun: (...a: unknown[]) => mockRun.finishRun(...a) }))
const mockClaim = { takeRunClaim: jest.fn(), releaseRunClaim: jest.fn() }
jest.mock("@/lib/cleanup/run/run-claim", () => ({ takeRunClaim: (...a: unknown[]) => mockClaim.takeRunClaim(...a),
  releaseRunClaim: (...a: unknown[]) => mockClaim.releaseRunClaim(...a) }))
const mockJobs = { readLibrary: jest.fn(), pruneIdleSnapshots: jest.fn(), syncCollections: jest.fn(), requestCollectionSync: jest.fn(), addJob: jest.fn(),
  readCleanupSettingsRow: jest.fn() }
jest.mock("@/lib/cleanup/snapshot/read", () => ({ readLibrary: (...a: unknown[]) => mockJobs.readLibrary(...a) }))
jest.mock("@/lib/cleanup/snapshot/store", () => ({ pruneIdleSnapshots: (...a: unknown[]) => mockJobs.pruneIdleSnapshots(...a) }))
jest.mock("@/lib/cleanup/collections/sync", () => ({ syncCollections: (...a: unknown[]) => mockJobs.syncCollections(...a) }))
jest.mock("@/lib/cleanup/collections/request", () => ({ requestCollectionSync: (...a: unknown[]) => mockJobs.requestCollectionSync(...a) }))
jest.mock("@/lib/cleanup/settings", () => ({ readCleanupSettingsRow: (...a: unknown[]) => mockJobs.readCleanupSettingsRow(...a) }))
jest.mock("@/lib/queue/client", () => ({ addJob: (...a: unknown[]) => mockJobs.addJob(...a) }))

import type { Job } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { ACT_ROUNDS, getCleanupProcessor } from "@/lib/queue/jobs/cleanup"
import { getJobProcessor } from "@/lib/queue/jobs/index"
import { JOB_ID_POLICY, JOB_TYPES } from "@/lib/queue/types"

const OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 604800 } }
const HELD = { claim: { column: "runClaimAt", lost: new AbortController().signal }, baseline: { rules: [], optionsHash: "h" } }
const COUNTS = { checked: 1, matched: 0, joined: 0, held: 0, rescued: 0, deleted: 1, failed: 0, deferred: 0, freedBytes: "10" }
const job = <T>(data: T) => ({ data }) as unknown as Job
const process = (type: string, data: unknown) => {
  const processor = getCleanupProcessor(type)
  if (!processor) throw new Error(`no processor for ${type}`)
  return processor(job(data))
}
const step = (overrides: object = {}) => ({ outcome: "finished", blocks: [], deleted: 1, deferred: 0, held: 0, seen: ["movie:tmdb:1"], ...overrides })

beforeEach(() => {
  mockReset(prismaMock)
  for (const fn of [...Object.values(mockAct), ...Object.values(mockRun), ...Object.values(mockClaim), ...Object.values(mockJobs)]) fn.mockReset()
  mockAct.stillAdmin.mockImplementation(async (id: string | undefined) => id ?? null)
  mockAct.actStep.mockResolvedValue(step())
  mockAct.candidatesToday.mockResolvedValue(["movie:tmdb:1"])
  mockClaim.takeRunClaim.mockResolvedValue(HELD)
  mockClaim.releaseRunClaim.mockResolvedValue({ rounds: 0 })
  mockRun.createRunRow.mockResolvedValue("run-act")
  mockRun.finishRun.mockResolvedValue(COUNTS)
  mockJobs.readCleanupSettingsRow.mockResolvedValue({ enabled: true })
  prismaMock.cleanupRule.count.mockResolvedValue(1)
  mockJobs.readLibrary.mockResolvedValue({ snapshotId: "snap-1", status: "complete", sources: [{ service: "plex", state: "ok" }, { service: "tautulli", state: "failed" }] })
})

describe("the registry", () => {
  it("gives a processor for each cleanup type, after the member activity one, and none for another type", () => {
    for (const type of [JOB_TYPES.CLEANUP_READ, JOB_TYPES.CLEANUP_RUN, JOB_TYPES.CLEANUP_ACT, JOB_TYPES.CLEANUP_COLLECTIONS]) {
      expect(getJobProcessor(type)).toBe(getCleanupProcessor(type))
    }
    expect(getCleanupProcessor(JOB_TYPES.MEMBER_ACTIVITY)).toBeNull()
    expect(getCleanupProcessor("toString")).toBeNull()
  })

  it("gives every act retry its own job id, and the nightly run its own id per wait (TS 9.2)", () => {
    const act = JOB_ID_POLICY[JOB_TYPES.CLEANUP_ACT]
    const run = JOB_ID_POLICY[JOB_TYPES.CLEANUP_RUN]
    if (!("deduplication" in act) || !("deduplication" in run)) throw new Error("cleanup jobs are deduplicated")
    expect([undefined, 1, 2].map((waits) => act.deduplication({ trigger: "approval", actorId: "a", waits }))).toEqual(["cleanup:act", "cleanup:act:retry:1",
      "cleanup:act:retry:2"])
    expect(run.deduplication({ trigger: "scheduled", act: true, waits: 1 })).toBe("cleanup:run:nightly:1")
    expect(run.deduplication({ trigger: "admin", act: false })).toBe("cleanup:run")
  })
})

describe("cleanup:read", () => {
  it("deletes snapshots older than 48 hours and skips a scheduled read with no rule and the feature off", async () => {
    mockJobs.readCleanupSettingsRow.mockResolvedValue({ enabled: false })
    prismaMock.cleanupRule.count.mockResolvedValue(0)
    mockJobs.pruneIdleSnapshots.mockResolvedValue(2)
    await expect(process(JOB_TYPES.CLEANUP_READ, { trigger: "scheduled", chain: true })).resolves.toEqual({ skipped: "idle", pruned: 2 })
    expect(mockJobs.readLibrary).not.toHaveBeenCalled()
    expect(mockJobs.addJob).not.toHaveBeenCalled()
  })

  it("reads, then chains the nightly run with the read's status, and returns codes only", async () => {
    await expect(process(JOB_TYPES.CLEANUP_READ, { trigger: "scheduled", chain: true })).resolves.toEqual({ snapshotId: "snap-1", status: "complete",
      failedSources: ["tautulli"] })
    expect(mockJobs.readLibrary).toHaveBeenCalledWith({ trigger: "scheduled", actorId: null, signal: shutdownSignal })
    expect(mockJobs.addJob).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_RUN, { trigger: "scheduled", act: true, readStatus: "complete" }, OPTIONS)
  })

  it.each([
    [{ busy: true }, "busy", { busy: true }],
    [{ snapshotId: "snap-2", status: "failed", sources: [] }, "failed", { snapshotId: "snap-2", status: "failed", failedSources: [] }],
    [{ skipped: "seasonOpen" }, "failed", { skipped: "seasonOpen" }],
  ])("chains the run after a read that ends %j, so reconcile still rescues", async (read, readStatus, result) => {
    mockJobs.readLibrary.mockResolvedValue(read)
    await expect(process(JOB_TYPES.CLEANUP_READ, { trigger: "scheduled", chain: true })).resolves.toEqual(result)
    expect(mockJobs.addJob).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_RUN, { trigger: "scheduled", act: true, readStatus }, OPTIONS)
  })

  it("adds the dry run of the saved rules after an admin read, as that admin while still one", async () => {
    await process(JOB_TYPES.CLEANUP_READ, { trigger: "admin", actorId: "admin-1", chain: false, thenDryRunRuleIds: ["rule-1"] })
    expect(mockJobs.readLibrary).toHaveBeenCalledWith({ trigger: "admin", actorId: "admin-1", signal: shutdownSignal })
    expect(mockJobs.addJob).toHaveBeenCalledTimes(1)
    expect(mockJobs.addJob).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_RUN, { trigger: "create", actorId: "admin-1", dryRunRuleIds: ["rule-1"], act: false }, OPTIONS)
    mockAct.stillAdmin.mockResolvedValue(null)
    await process(JOB_TYPES.CLEANUP_READ, { trigger: "admin", actorId: "admin-2", chain: false })
    expect(mockJobs.readLibrary).toHaveBeenLastCalledWith({ trigger: "admin", actorId: null, signal: shutdownSignal })
  })
})

describe("cleanup:run", () => {
  it("runs with the payload, the shutdown signal and the actor that still holds", async () => {
    mockRun.runCleanup.mockResolvedValue({ busy: false, runId: "run-1", outcome: "finished", ...COUNTS })
    await expect(process(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId: "admin-1", act: false })).resolves.toMatchObject({ runId: "run-1", outcome: "finished" })
    expect(mockRun.runCleanup).toHaveBeenCalledWith({ trigger: "admin", actorId: "admin-1", act: false, signal: shutdownSignal })
    mockAct.stillAdmin.mockResolvedValue(null)
    await process(JOB_TYPES.CLEANUP_RUN, { trigger: "admin", actorId: "admin-1", act: false })
    expect(mockRun.runCleanup).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: "system" }))
    await process(JOB_TYPES.CLEANUP_RUN, { trigger: "scheduled", act: true, readStatus: "failed", waits: 2 })
    expect(mockRun.runCleanup).toHaveBeenLastCalledWith({ trigger: "scheduled", act: true, readStatus: "failed", waits: 2, actorId: "system", signal: shutdownSignal })
    expect(mockAct.stillAdmin).toHaveBeenCalledTimes(2)
  })
})

describe("cleanup:act", () => {
  it("adds itself again after 10 minutes with waits + 1 while the claim is busy, and never acts without it", async () => {
    mockClaim.takeRunClaim.mockResolvedValue(null)
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits: 5 })).resolves.toEqual({ busy: true, retry: 6 })
    expect(mockJobs.addJob).toHaveBeenCalledWith(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits: 6 }, { ...OPTIONS, delay: 600_000 })
    await process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })
    expect(mockJobs.addJob).toHaveBeenLastCalledWith(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits: 1 }, { ...OPTIONS, delay: 600_000 })
    expect(mockAct.actStep).not.toHaveBeenCalled()
  })

  it("writes a busy act row after 6 waits and returns", async () => {
    mockClaim.takeRunClaim.mockResolvedValue(null)
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1", waits: 6 })).resolves.toEqual({ busy: true })
    expect(mockRun.busyRunRow).toHaveBeenCalledWith("act", "approval", "admin-1")
    expect(mockJobs.addJob).not.toHaveBeenCalled()
    expect(mockAct.actStep).not.toHaveBeenCalled()
  })

  it("acts once under the claim, finishes the row, releases with the change check and asks for a sync", async () => {
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })).resolves.toEqual({ runId: "run-act", outcome: "finished", rounds: 1,
      ...COUNTS })
    expect(mockRun.createRunRow).toHaveBeenCalledWith({ kind: "act", trigger: "approval", actorId: "admin-1" })
    expect(mockAct.actStep).toHaveBeenCalledWith({ runId: "run-act", trigger: "approval", actorId: "admin-1", signal: expect.any(AbortSignal), reconciled: false })
    expect(mockRun.finishRun).toHaveBeenCalledWith("run-act", { kind: "act", trigger: "approval", actorId: "admin-1", outcome: "finished", blocks: [], entries: [],
      checked: 1, matched: 0, joined: 0, held: 0, deferred: 0 })
    expect(mockClaim.releaseRunClaim).toHaveBeenCalledWith(HELD.claim, HELD.baseline, { actorId: "admin-1", runId: "run-act" })
    expect(mockJobs.requestCollectionSync).toHaveBeenCalledWith("act")
  })

  it("stops the act step when the run claim is lost, as a shutdown does (another holder may act)", async () => {
    const lost = new AbortController()
    mockClaim.takeRunClaim.mockResolvedValue({ ...HELD, claim: { ...HELD.claim, lost: lost.signal } })
    let signal: AbortSignal | undefined
    mockAct.actStep.mockImplementation(async (input: { signal: AbortSignal }) => {
      signal = input.signal
      return step()
    })
    await process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })
    expect(signal?.aborted).toBe(false)
    lost.abort()
    expect(signal?.aborted).toBe(true)
  })

  it("runs the step again for a candidate planned for today that it did not see (an approval during the job), at most 3 rounds", async () => {
    mockAct.actStep.mockResolvedValueOnce(step({ seen: ["a"], deferred: 1 })).mockResolvedValueOnce(step({ seen: ["b"], held: 2 }))
      .mockResolvedValueOnce(step({ seen: ["c"] }))
    mockAct.candidatesToday.mockResolvedValueOnce(["a", "b"]).mockResolvedValueOnce(["a", "b", "c"]).mockResolvedValue(["d"])
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })).resolves.toMatchObject({ rounds: ACT_ROUNDS })
    expect(mockAct.actStep).toHaveBeenCalledTimes(3)
    expect(mockRun.finishRun).toHaveBeenCalledWith("run-act", expect.objectContaining({ checked: 3, deferred: 1, held: 2 }))
  })

  it("stops the rounds when a step stops, and acts as the system for an approver who is no longer an admin", async () => {
    mockAct.stillAdmin.mockResolvedValue(null)
    mockAct.actStep.mockResolvedValue(step({ outcome: "paused", blocks: [{ code: "paused" }] }))
    mockAct.candidatesToday.mockResolvedValue(["other"])
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })).resolves.toMatchObject({ outcome: "paused", rounds: 1 })
    expect(mockRun.finishRun).toHaveBeenCalledWith("run-act", expect.objectContaining({ actorId: "system", outcome: "paused", blocks: [{ code: "paused" }] }))
    expect(mockAct.candidatesToday).not.toHaveBeenCalled()
  })

  it("releases the claim and throws on a database error", async () => {
    mockAct.actStep.mockRejectedValue(new Error("db down"))
    mockClaim.releaseRunClaim.mockRejectedValueOnce(new Error("release failed"))
    await expect(process(JOB_TYPES.CLEANUP_ACT, { trigger: "approval", actorId: "admin-1" })).rejects.toThrow("db down")
    expect(mockClaim.releaseRunClaim).toHaveBeenCalledWith(HELD.claim, HELD.baseline, { actorId: "admin-1", runId: "run-act" })
    expect(mockJobs.requestCollectionSync).not.toHaveBeenCalled()
  })
})

describe("cleanup:collections", () => {
  it("syncs with the shutdown signal and returns the counts", async () => {
    mockJobs.syncCollections.mockResolvedValue({ collections: 2, added: 3, removed: 1, moved: 0, recreated: 0, deleted: 0, busy: false, rounds: 1 })
    await expect(process(JOB_TYPES.CLEANUP_COLLECTIONS, { reason: "scheduled" })).resolves.toEqual({ collections: 2, added: 3, removed: 1, moved: 0, recreated: 0,
      busy: false })
    expect(mockJobs.syncCollections).toHaveBeenCalledWith({ signal: shutdownSignal })
  })
})
