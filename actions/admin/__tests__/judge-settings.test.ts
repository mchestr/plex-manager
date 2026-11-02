/**
 * @jest-environment node
 *
 * The conversation review settings save: bounds, the audit row through
 * `configDiff`, and the nightly schedule.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"
import { mockReset } from "jest-mock-extended"

import { saveJudgeSettings } from "@/actions/admin/judge-settings"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ensureJudgeSchedule } from "@/lib/judge/schedule"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/judge/schedule", () => ({ ensureJudgeSchedule: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const settings = { judgeNightlyEnabled: true, judgeSampleRate: 25, judgeMinTurns: 3, llmDailyCapJudgeUsd: 2.5 }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(ensureJudgeSchedule).mockResolvedValue({ ok: true, state: "scheduled" })
  prismaMock.config.findUnique.mockResolvedValue({ judgeNightlyEnabled: false, judgeSampleRate: 100, judgeMinTurns: 2, llmDailyCapJudgeUsd: 1 } as never)
  prismaMock.config.upsert.mockResolvedValue({} as never)
})

describe("saveJudgeSettings", () => {
  it("saveJudgeSettings validates bounds and reschedules", async () => {
    const outOfBounds = [
      { judgeSampleRate: -1 },
      { judgeSampleRate: 101 },
      { judgeSampleRate: 12.5 },
      { judgeMinTurns: 0 },
      { judgeMinTurns: 51 },
      { judgeMinTurns: 2.5 },
      { llmDailyCapJudgeUsd: -0.01 },
      { llmDailyCapJudgeUsd: 1000.01 },
    ]
    for (const patch of outOfBounds) {
      await expect(saveJudgeSettings({ ...settings, ...patch })).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    }
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
    expect(ensureJudgeSchedule).not.toHaveBeenCalled()

    const edges = { judgeNightlyEnabled: false, judgeSampleRate: 0, judgeMinTurns: 50, llmDailyCapJudgeUsd: 1000 }
    await expect(saveJudgeSettings(edges)).resolves.toEqual({ success: true, data: null })
    expect(prismaMock.config.upsert).toHaveBeenCalledWith({
      where: { id: "config" },
      create: { id: "config", ...edges, updatedBy: "admin-1" },
      update: { ...edges, updatedBy: "admin-1" },
    })
    expect(ensureJudgeSchedule).toHaveBeenCalledTimes(1)
    expect(jest.mocked(prismaMock.config.upsert).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(ensureJudgeSchedule).mock.invocationCallOrder[0]!
    )
    expect(revalidatePath).toHaveBeenCalledWith("/admin/settings")
  })

  it("saveJudgeSettings writes CONFIG_CHANGED through configDiff", async () => {
    await saveJudgeSettings({ ...settings, judgeMinTurns: 2 })

    expect(prismaMock.config.findUnique).toHaveBeenCalledWith({
      where: { id: "config" },
      select: { judgeNightlyEnabled: true, judgeSampleRate: true, judgeMinTurns: true, llmDailyCapJudgeUsd: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, "admin-1", {
      section: "judge",
      changedFields: ["judgeNightlyEnabled", "judgeSampleRate", "llmDailyCapJudgeUsd"],
      secretChanged: false,
      origins: { before: {}, after: {} },
    })
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(saveJudgeSettings(settings)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("says so when the queue did not take the schedule", async () => {
    jest.mocked(ensureJudgeSchedule).mockResolvedValue({ ok: false, code: "TIMEOUT" })
    await expect(saveJudgeSettings(settings)).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
    expect(prismaMock.config.upsert).toHaveBeenCalled()
    expect(logAuditEvent).toHaveBeenCalled()
  })
})
