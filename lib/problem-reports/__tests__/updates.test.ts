/**
 * queueMemberUpdates: one DM job per member who made or follows the report,
 * without the one who changed it, from a request or a worker; and the
 * admins' alert from the fix job. Nothing throws.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { queueAdminAlertFromWorker, queueMemberUpdates } from "@/lib/problem-reports/updates"
import { addJob } from "@/lib/queue/client"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => mockRedis() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) }))

const mockRedis = jest.fn(() => true)
const OPTIONS = { attempts: 3, backoff: { type: "exponential", delay: 60_000 } }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockRedis.mockReturnValue(true)
  prismaMock.problemReport.findUnique.mockResolvedValue({
    reporterId: "member-1",
    events: [{ actorUserId: "member-2" }, { actorUserId: "member-2" }, { actorUserId: "member-3" }],
  } as never)
  jest.mocked(enqueueFromRequest).mockResolvedValue({ ok: true, jobId: "job" })
})

describe("queueMemberUpdates", () => {
  it("queues one DM for the reporter and each follower, from a request", async () => {
    await queueMemberUpdates("report-1", "FIXED", { from: "request" })

    expect(jest.mocked(enqueueFromRequest).mock.calls.map(([, data]) => data)).toEqual([
      { reportId: "report-1", userId: "member-1", status: "FIXED" },
      { reportId: "report-1", userId: "member-2", status: "FIXED" },
      { reportId: "report-1", userId: "member-3", status: "FIXED" },
    ])
    expect(enqueueFromRequest).toHaveBeenCalledWith(JOB_TYPES.PROBLEM_REPORT_UPDATE, expect.anything(), OPTIONS)
  })

  it("leaves out the member who changed it, and queues from a worker with addJob", async () => {
    await queueMemberUpdates("report-1", "CLOSED", { from: "worker", except: "member-1" })

    expect(jest.mocked(addJob).mock.calls.map(([, data]) => data)).toEqual([
      { reportId: "report-1", userId: "member-2", status: "CLOSED" },
      { reportId: "report-1", userId: "member-3", status: "CLOSED" },
    ])
    expect(enqueueFromRequest).not.toHaveBeenCalled()
  })

  it("queues nothing without Redis, and never throws", async () => {
    mockRedis.mockReturnValue(false)
    await queueMemberUpdates("report-1", "FIXED", { from: "request" })
    expect(prismaMock.problemReport.findUnique).not.toHaveBeenCalled()

    mockRedis.mockReturnValue(true)
    jest.mocked(addJob).mockRejectedValue(new Error("Redis is down"))
    await expect(queueMemberUpdates("report-1", "FIXED", { from: "worker" })).resolves.toBeUndefined()
  })
})

describe("queueAdminAlertFromWorker", () => {
  it("queues the admins' alert, and never throws", async () => {
    await queueAdminAlertFromWorker("report-1")
    expect(addJob).toHaveBeenCalledWith(JOB_TYPES.PROBLEM_REPORT_NOTIFY, { reportId: "report-1" }, OPTIONS)

    jest.mocked(addJob).mockRejectedValue(new Error("Redis is down"))
    await expect(queueAdminAlertFromWorker("report-1")).resolves.toBeUndefined()
  })
})
