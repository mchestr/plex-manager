/**
 * @jest-environment node
 *
 * The inactivity sweep actions: the settings save (audited only when a value
 * changed, and a new threshold refused below twice the largest lead while
 * warnings are on), the warning email save (leads checked against the
 * threshold, a switch-on only with email and Redis set up), both saves in one
 * Serializable transaction each, "Run now" (queued with Redis on the fail-fast request path, else
 * run in the request; refused while a run or a queued Run now is pending) and
 * the per-member exclusion.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { runMemberActivityNow, setMemberInactivityExcluded, updateInactivitySettings, updateInactivityWarnings } from "@/actions/admin/inactivity"
import { buildInactivitySettings } from "@/__tests__/helpers/factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getActiveService } from "@/lib/data/active-service"
import { inSerializable } from "@/lib/db/serializable"
import { Prisma } from "@/lib/generated/prisma/client"
import { emailConfigured } from "@/lib/email/config"
import { isRunInProgress, runMemberActivity } from "@/lib/inactivity/run"
import { isRedisConfigured } from "@/lib/queue/connection"
import { jobIdOptions } from "@/lib/queue/job-id"
import { enqueueFromRequest, isDeduplicatedJobPending } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn(), isDeduplicatedJobPending: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/email/config", () => ({ emailConfigured: jest.fn() }))
jest.mock("@/lib/db/serializable", () => ({ ...jest.requireActual("@/lib/db/serializable"), inSerializable: jest.fn() }))
jest.mock("@/lib/inactivity/run", () => ({ isRunInProgress: jest.fn(), runMemberActivity: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const ran = { busy: false as const, runId: "run-1", matched: 4, qualified: 1, removed: 1, failed: 0, warned: 0, blocked: null, error: null }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(getActiveService).mockResolvedValue({ id: "t1", url: "http://tautulli.local", apiKey: "k" } as never)
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  jest.mocked(runMemberActivity).mockResolvedValue(ran)
  jest.mocked(isRunInProgress).mockResolvedValue(false)
  jest.mocked(isDeduplicatedJobPending).mockResolvedValue({ ok: true, value: false })
  // The queue adds the job under the id it was given
  jest.mocked(enqueueFromRequest).mockImplementation(async (_type, _data, options) => ({ ok: true, jobId: String(options?.jobId) }))
  prismaMock.inactivitySettings.findUnique.mockResolvedValue(null)
  jest.mocked(emailConfigured).mockReturnValue(true)
  // The transaction body runs on the mock client, as one attempt
  jest.mocked(inSerializable).mockImplementation((body) => body(asAppTransactionClient(prismaMock)))
})

const conflict = () => new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "7" })
const SAVE_CONFLICT = "The inactivity settings changed while you saved. Reload the page and try again."

describe("updateInactivitySettings", () => {
  it("refuses a member and a Support user", async () => {
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "m1", isAdmin: false } })
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "s1", isAdmin: false, role: "support" } })
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("saves the settings with who saved them, and audits what changed from the defaults", async () => {
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 180 })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith({
      where: { id: "inactivity" },
      create: { id: "inactivity", enabled: true, thresholdDays: 180, updatedBy: "admin-1" },
      update: { enabled: true, thresholdDays: 180, updatedBy: "admin-1" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_SETTINGS_CHANGED, "admin-1", {
      section: "inactivity",
      changedFields: ["enabled"],
      before: { enabled: false, thresholdDays: 180 },
      after: { enabled: true, thresholdDays: 180 },
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("audits every changed field against the saved row", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 180 }))

    await updateInactivitySettings({ enabled: false, thresholdDays: 90 })

    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.INACTIVITY_SETTINGS_CHANGED,
      "admin-1",
      expect.objectContaining({ changedFields: ["enabled", "thresholdDays"], before: { enabled: true, thresholdDays: 180 } })
    )
  })

  it("saves without an audit row when nothing changed", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ enabled: true, thresholdDays: 90 }))

    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toMatchObject({ success: true })
    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each([29, 3651, 90.5])("refuses a threshold of %p days", async (thresholdDays) => {
    await expect(updateInactivitySettings({ enabled: true, thresholdDays })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("never returns a database error's text", async () => {
    prismaMock.inactivitySettings.upsert.mockRejectedValue(new Error("connection to db:5432 refused"))
    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toEqual({
      success: false,
      code: "INTERNAL",
      error: "Could not save the inactivity settings",
    })
  })

  describe("while warning emails are on", () => {
    beforeEach(() => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true, warningDays: [30, 7, 1] }))
    })

    it("refuses a threshold below twice the largest lead, on the threshold field", async () => {
      const error = "With warning emails on, use at least 60 days: twice the 30 days before removal of the first warning."

      await expect(updateInactivitySettings({ enabled: true, thresholdDays: 59 })).resolves.toEqual({
        success: false,
        code: "VALIDATION",
        error,
        fieldErrors: { thresholdDays: [error] },
      })
      expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
      expect(logAuditEvent).not.toHaveBeenCalled()
    })

    it("saves a threshold of exactly twice the largest lead", async () => {
      await expect(updateInactivitySettings({ enabled: true, thresholdDays: 60 })).resolves.toMatchObject({ success: true })
      expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalled()
    })

    it("turns removal off with the threshold unchanged, even when the saved leads break the rule", async () => {
      prismaMock.inactivitySettings.findUnique.mockResolvedValue(
        buildInactivitySettings({ enabled: true, thresholdDays: 100, warningsEnabled: true, warningDays: [90] })
      )

      await expect(updateInactivitySettings({ enabled: false, thresholdDays: 100 })).resolves.toEqual({ success: true, data: null })
      expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { enabled: false, thresholdDays: 100, updatedBy: "admin-1" } }))
    })
  })

  it("reads, checks and writes in one Serializable transaction", async () => {
    await updateInactivitySettings({ enabled: true, thresholdDays: 90 })

    expect(inSerializable).toHaveBeenCalledTimes(1)
  })

  it("refuses a save that lost a race with another save, without an audit row", async () => {
    jest.mocked(inSerializable).mockRejectedValue(conflict())

    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 90 })).resolves.toEqual({ success: false, code: "CONFLICT", error: SAVE_CONFLICT })
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("saves a short threshold while warning emails are off, whatever the leads", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: false, warningDays: [30, 7, 1] }))

    await expect(updateInactivitySettings({ enabled: true, thresholdDays: 30 })).resolves.toMatchObject({ success: true })
  })
})

describe("updateInactivityWarnings", () => {
  const ON = { warningsEnabled: true, warningDays: [30, 7, 1] }

  beforeEach(() => jest.mocked(isRedisConfigured).mockReturnValue(true))

  it("refuses a signed-out caller, a member and a Support user, with no write and no audit row", async () => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(updateInactivityWarnings(ON)).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "m1", isAdmin: false } })
    await expect(updateInactivityWarnings(ON)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })

    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "s1", isAdmin: false, role: "support" } })
    await expect(updateInactivityWarnings(ON)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("turns warnings on, saves the leads largest first with who saved them, and audits the change", async () => {
    await expect(updateInactivityWarnings({ warningsEnabled: true, warningDays: [7, 1, 30] })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith({
      where: { id: "inactivity" },
      create: { id: "inactivity", warningsEnabled: true, warningDays: [30, 7, 1], updatedBy: "admin-1" },
      update: { warningsEnabled: true, warningDays: [30, 7, 1], updatedBy: "admin-1" },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_SETTINGS_CHANGED, "admin-1", {
      section: "inactivity-warnings",
      changedFields: ["warningsEnabled"],
      before: { warningsEnabled: false, warningDays: [30, 7, 1] },
      after: { warningsEnabled: true, warningDays: [30, 7, 1] },
    })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
    expect(revalidatePath).toHaveBeenCalledWith("/account")
  })

  it("audits new leads, and saves without an audit row when nothing changed", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true, warningDays: [30, 7, 1] }))

    await updateInactivityWarnings({ warningsEnabled: true, warningDays: [14, 3] })
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.INACTIVITY_SETTINGS_CHANGED,
      "admin-1",
      expect.objectContaining({ section: "inactivity-warnings", changedFields: ["warningDays"], after: { warningsEnabled: true, warningDays: [14, 3] } })
    )

    jest.mocked(logAuditEvent).mockClear()
    await expect(updateInactivityWarnings(ON)).resolves.toMatchObject({ success: true })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it.each([
    ["no lead", []],
    ["a lead of zero", [30, 0]],
    ["a part day", [7.5]],
    ["the same lead twice", [7, 7]],
    ["more than four leads", [30, 14, 7, 3, 1]],
    ["a lead above 90 days", [91, 7]],
  ])("refuses %s", async (_case, warningDays) => {
    await expect(updateInactivityWarnings({ warningsEnabled: true, warningDays })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("saves four leads", async () => {
    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [1, 3, 14, 30] })).resolves.toMatchObject({ success: true })
    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ warningDays: [30, 14, 3, 1] }) }))
  })

  it("refuses a largest lead above half the saved threshold, naming both numbers, with warnings off too", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ thresholdDays: 45 }))
    const error = "Use at most 22 days, half of the 45 days without a play. 30 is too many."

    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [30, 7] })).resolves.toEqual({
      success: false,
      code: "VALIDATION",
      error,
      fieldErrors: { warningDays: [error] },
    })
    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [22, 7] })).resolves.toMatchObject({ success: true })
  })

  it.each([
    ["email is not set up", false, true, "Set up email first. Warning emails need SMTP_URL and EMAIL_FROM."],
    ["Redis is not set up", true, false, "Set up Redis first. Warning emails go out through the job queue."],
  ])("refuses to turn warnings on while %s, on the switch", async (_case, email, redis, error) => {
    jest.mocked(emailConfigured).mockReturnValue(email)
    jest.mocked(isRedisConfigured).mockReturnValue(redis)

    await expect(updateInactivityWarnings(ON)).resolves.toEqual({ success: false, code: "VALIDATION", error, fieldErrors: { warningsEnabled: [error] } })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("turns warnings off with the days unchanged, even when they break the rule", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ thresholdDays: 100, warningsEnabled: true, warningDays: [90] }))

    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [90] })).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.inactivitySettings.upsert).toHaveBeenCalled()
  })

  it("refuses to turn warnings on with unchanged days above half the saved threshold", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ thresholdDays: 45 }))

    await expect(updateInactivityWarnings(ON)).resolves.toMatchObject({
      success: false,
      code: "VALIDATION",
      fieldErrors: { warningDays: ["Use at most 22 days, half of the 45 days without a play. 30 is too many."] },
    })
    expect(prismaMock.inactivitySettings.upsert).not.toHaveBeenCalled()
  })

  it("refuses a save that lost a race with another save, without an audit row", async () => {
    jest.mocked(inSerializable).mockRejectedValue(conflict())

    await expect(updateInactivityWarnings(ON)).resolves.toEqual({ success: false, code: "CONFLICT", error: SAVE_CONFLICT })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("lets warnings that are on stay on, or turn off, while email is not set up", async () => {
    jest.mocked(emailConfigured).mockReturnValue(false)
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))

    await expect(updateInactivityWarnings({ warningsEnabled: true, warningDays: [14, 1] })).resolves.toMatchObject({ success: true })
    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [30, 7, 1] })).resolves.toMatchObject({ success: true })
  })

  it("never returns a database error's text", async () => {
    prismaMock.inactivitySettings.upsert.mockRejectedValue(new Error("connection to db:5432 refused"))
    await expect(updateInactivityWarnings({ warningsEnabled: false, warningDays: [30, 7, 1] })).resolves.toEqual({
      success: false,
      code: "INTERNAL",
      error: "Could not save the warning email settings",
    })
  })
})

describe("runMemberActivityNow", () => {
  const BUSY = { success: false, code: "CONFLICT", error: "A run is already in progress. Try again in a few minutes." }
  const QUEUE_DOWN = { success: false, code: "UPSTREAM_UNAVAILABLE", error: "The job queue is unavailable. Try again in a minute." }

  /** Nothing queued, run or audited. */
  function expectNothingStarted() {
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
  }

  it("queues the run once on the request path as the admin, with the members they confirmed", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1", "u2", "u3"] })).resolves.toEqual({ success: true, data: { queued: true } })

    expect(enqueueFromRequest).toHaveBeenCalledWith(
      "members:activity",
      { triggeredBy: "admin", triggeredByUserId: "admin-1", confirmedUserIds: ["u1", "u2", "u3"] },
      // One attempt, gone from the queue when it ends: Job queues cannot replay a confirmation.
      // Its own id beside the shared deduplication id shows whether it joined another job
      { attempts: 1, removeOnComplete: true, removeOnFail: true, jobId: expect.any(String), deduplication: { id: "members:activity" } }
    )
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: true, confirmedRemovals: 3 })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("refuses, without an audit row, when the job joined one queued a moment earlier", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "earlier-job" })

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1"] })).resolves.toEqual({
      success: false,
      code: "CONFLICT",
      error: "A run is already in progress. Try again in a few minutes.",
    })
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("gives each Run now its own job id", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await runMemberActivityNow({})
    await runMemberActivityNow({})

    const ids = jest.mocked(enqueueFromRequest).mock.calls.map(([, , options]) => options?.jobId)
    expect(new Set(ids).size).toBe(2)
  })

  it("checks the deduplication id the job policy gives the job", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)

    await runMemberActivityNow({})

    const { deduplication } = jobIdOptions(JOB_TYPES.MEMBER_ACTIVITY, { triggeredBy: "admin" })
    expect(isDeduplicatedJobPending).toHaveBeenCalledWith(deduplication?.id)
    expect(deduplication?.id).toBe("members:activity")
  })

  it("refuses while an earlier Run now is still queued, since the new job would join it and lose its confirmation", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(isDeduplicatedJobPending).mockResolvedValue({ ok: true, value: true })

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1"] })).resolves.toEqual(BUSY)
    expectNothingStarted()
  })

  it.each([
    ["the pending check", () => jest.mocked(isDeduplicatedJobPending).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })],
    ["the enqueue", () => jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })],
  ])("answers at once, with no audit row, when the queue does not answer %s", async (_name, down) => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    down()

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1"] })).resolves.toEqual(QUEUE_DOWN)
    expect(runMemberActivity).not.toHaveBeenCalled()
    expect(logAuditEvent).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("runs it in the request without Redis, for at most two minutes", async () => {
    await expect(runMemberActivityNow({})).resolves.toEqual({ success: true, data: { queued: false } })

    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: "admin-1", confirmedUserIds: undefined, signal: expect.any(AbortSignal) })
    expect(isDeduplicatedJobPending).not.toHaveBeenCalled()
    expect(enqueueFromRequest).not.toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: false, confirmedRemovals: null })
  })

  it("passes the confirmed members to a run in the request, and audits how many", async () => {
    await runMemberActivityNow({ confirmedUserIds: ["u1", "u2"] })

    expect(runMemberActivity).toHaveBeenCalledWith("admin", expect.objectContaining({ confirmedUserIds: ["u1", "u2"] }))
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: false, confirmedRemovals: 2 })
  })

  it("audits an empty confirmation as none confirmed", async () => {
    await runMemberActivityNow({ confirmedUserIds: [] })

    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: false, confirmedRemovals: 0 })
  })

  it("says so when another run is in progress", async () => {
    jest.mocked(runMemberActivity).mockResolvedValue({ busy: true })

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1"] })).resolves.toEqual(BUSY)
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses before queueing while another run (the daily one, say) holds the claim", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    jest.mocked(isRunInProgress).mockResolvedValue(true)

    await expect(runMemberActivityNow({ confirmedUserIds: ["u1", "u2"] })).resolves.toEqual(BUSY)
    expect(isDeduplicatedJobPending).not.toHaveBeenCalled()
    expectNothingStarted()
  })

  it("asks for Tautulli first", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    await expect(runMemberActivityNow({})).resolves.toEqual({
      success: false,
      code: "VALIDATION",
      error: "Set up Tautulli first. Last seen comes from Tautulli.",
    })
    expect(getActiveService).toHaveBeenCalledWith("tautulli")
    expect(isRunInProgress).not.toHaveBeenCalled()
    expectNothingStarted()
  })

  it.each<[string, unknown]>([
    ["a count instead of members", 3],
    ["an empty id", [""]],
    ["an id over 100 characters", ["u".repeat(101)]],
    ["a number for an id", [42]],
    ["over 1000 members", Array.from({ length: 1001 }, (_, index) => `u${index}`)],
  ])("refuses %s", async (_name, confirmedUserIds) => {
    await expect(runMemberActivityNow({ confirmedUserIds } as never)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(runMemberActivity).not.toHaveBeenCalled()
  })

  it("reads a count from a page loaded before the update as no confirmation, so the run removes no one", async () => {
    await expect(runMemberActivityNow({ confirmedRemovals: 3 } as never)).resolves.toMatchObject({ success: true })

    expect(runMemberActivity).toHaveBeenCalledWith("admin", expect.objectContaining({ confirmedUserIds: undefined }))
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.ACTIVITY_SYNC_TRIGGERED, "admin-1", { queued: false, confirmedRemovals: null })
  })

  it("takes 1000 members", async () => {
    const confirmedUserIds = Array.from({ length: 1000 }, (_, index) => `u${index}`)

    await expect(runMemberActivityNow({ confirmedUserIds })).resolves.toMatchObject({ success: true })
    expect(runMemberActivity).toHaveBeenCalledWith("admin", expect.objectContaining({ confirmedUserIds }))
  })

  it("spends the admin rate limit", async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 30 })

    await expect(runMemberActivityNow({})).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(consume).toHaveBeenCalledWith("admin", "admin-1")
    expect(runMemberActivity).not.toHaveBeenCalled()
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(runMemberActivityNow({})).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(runMemberActivity).not.toHaveBeenCalled()
  })
})

describe("setMemberInactivityExcluded", () => {
  it("excludes a member, audits it and refreshes both pages", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })

    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { inactivityExcluded: true } })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.INACTIVITY_EXCLUSION_CHANGED, "admin-1", { targetUserId: "u1", excluded: true })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/u1")
    expect(revalidatePath).toHaveBeenCalledWith("/admin/inactivity")
  })

  it("includes a member again", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
    await setMemberInactivityExcluded({ userId: "u1", excluded: false })
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1" }, data: { inactivityExcluded: false } })
  })

  it("reports a member that is not there, without an audit row", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 })
    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(logAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses bad input and a member", async () => {
    await expect(setMemberInactivityExcluded({ userId: "", excluded: true })).resolves.toMatchObject({ success: false, code: "VALIDATION" })

    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(setMemberInactivityExcluded({ userId: "u1", excluded: true })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })
})
