/**
 * @jest-environment node
 */

/**
 * The member activity processor: a scheduled run as the system, and an admin
 * run as that admin with the members they confirmed, but only while the
 * confirmation is theirs to give: the job's first attempt, under 15 minutes
 * old, and the user still an admin.
 */

const mockWarn = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/inactivity/run", () => ({ runMemberActivity: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args) }),
}))

import { mockReset } from "jest-mock-extended"

import { buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { runMemberActivity } from "@/lib/inactivity/run"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"

import { JOB_TYPES, type JobPayloadMap } from "../../types"
import { CONFIRMATION_TTL_MS, getMemberActivityProcessor } from "../member-activity"

const processor = getMemberActivityProcessor(JOB_TYPES.MEMBER_ACTIVITY)!
const finished = { busy: false as const, runId: "run-1", matched: 3, qualified: 1, removed: 1, failed: 0, blocked: null, error: null }
const NOW = Date.parse("2026-10-31T12:00:00.000Z")

type Payload = JobPayloadMap[typeof JOB_TYPES.MEMBER_ACTIVITY]

/** A job queued `ageMs` ago, on its first attempt unless told otherwise. */
const job = (data: Payload, { ageMs = 1_000, attemptsMade = 0 } = {}) => ({ data, attemptsMade, timestamp: NOW - ageMs })

const adminRun: Payload = { triggeredBy: "admin", triggeredByUserId: "admin-1", confirmedUserIds: ["u1", "u2"] }

beforeEach(() => {
  mockReset(prismaMock)
  mockWarn.mockReset()
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(runMemberActivity).mockReset().mockResolvedValue(finished)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "admin-1", isAdmin: true }))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("member activity processor", () => {
  it("runs a scheduled run as the system, with no confirmation even if the data holds one", async () => {
    await expect(processor(job({ triggeredBy: "scheduled", confirmedUserIds: ["u1"] }))).resolves.toEqual(finished)

    expect(runMemberActivity).toHaveBeenCalledWith("scheduled", { actorId: SYSTEM_ACTOR, signal: shutdownSignal })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it("runs a fresh admin run as that admin, with the members they confirmed", async () => {
    await processor(job(adminRun))

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { isAdmin: true } })
    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: "admin-1", confirmedUserIds: ["u1", "u2"], signal: shutdownSignal })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("keeps the confirmation until just before 15 minutes", async () => {
    await processor(job(adminRun, { ageMs: CONFIRMATION_TTL_MS - 1 }))

    expect(runMemberActivity).toHaveBeenCalledWith("admin", expect.objectContaining({ confirmedUserIds: ["u1", "u2"] }))
    expect(CONFIRMATION_TTL_MS).toBe(15 * 60 * 1000)
  })

  it.each([
    ["queued 15 minutes ago", { ageMs: CONFIRMATION_TTL_MS }],
    ["queued an hour ago", { ageMs: 60 * 60 * 1000 }],
    ["run before, as a retry from Job queues", { attemptsMade: 1 }],
  ])("drops the confirmation of an admin job %s, so a run with members to remove removes no one", async (_name, at) => {
    await processor(job(adminRun, at))

    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: "admin-1", confirmedUserIds: undefined, signal: shutdownSignal })
    expect(mockWarn).toHaveBeenCalledWith("inactivity.confirmation_dropped", expect.objectContaining({ stillAdmin: true }))
  })

  it.each([
    ["no longer an admin", buildUser({ id: "admin-1", isAdmin: false })],
    ["gone", null],
  ])("runs as the system with no confirmation when the user who queued it is %s", async (_name, user) => {
    prismaMock.user.findUnique.mockResolvedValue(user)

    await processor(job(adminRun))

    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: SYSTEM_ACTOR, confirmedUserIds: undefined, signal: shutdownSignal })
    expect(mockWarn).toHaveBeenCalledWith("inactivity.confirmation_dropped", { stillAdmin: false, attemptsMade: 0, ageMs: 1_000 })
  })

  it("runs an admin job without a user as the system, and logs nothing when nothing was confirmed", async () => {
    await processor(job({ triggeredBy: "admin" }))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(runMemberActivity).toHaveBeenCalledWith("admin", { actorId: SYSTEM_ACTOR, confirmedUserIds: undefined, signal: shutdownSignal })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("reports a busy run and a skipped one", async () => {
    jest.mocked(runMemberActivity).mockResolvedValueOnce({ busy: true }).mockResolvedValueOnce(null)
    await expect(processor(job({ triggeredBy: "scheduled" }))).resolves.toEqual({ busy: true })
    await expect(processor(job({ triggeredBy: "scheduled" }))).resolves.toEqual({ skipped: true })
  })

  it("has no processor for another type", () => {
    expect(getMemberActivityProcessor(JOB_TYPES.REQUEST_TIER_SYNC)).toBeNull()
  })
})
