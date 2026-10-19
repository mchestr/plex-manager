/**
 * updateLlmCaps (P4.20): the assistant's daily spend caps, saved by an admin
 * and audited as a CONFIG_CHANGED diff.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { updateLlmCaps } from "@/actions/admin"
import type { Config } from "@/lib/generated/prisma/client"
import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  updateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const session = (isAdmin: boolean) => ({
  user: { id: "admin-1", email: "a@example.com", name: "Admin", isAdmin },
  expires: "2099-01-01T00:00:00.000Z",
})

const caps = { llmDailyCapPerUserUsd: 0.25, llmDailyCapAdminUsd: 3, llmDailyCapServerUsd: 10 }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(session(true))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.config.upsert.mockResolvedValue(buildConfig(caps))
})

describe("updateLlmCaps", () => {
  it("saves the three caps and audits which ones changed", async () => {
    // The stored row, as the action's select reads it: only the admin cap stays the same
    prismaMock.config.findUnique.mockResolvedValue({
      llmDailyCapPerUserUsd: 0.5,
      llmDailyCapAdminUsd: 3,
      llmDailyCapServerUsd: 5,
    } as Config)

    expect(await updateLlmCaps(caps)).toEqual({ success: true, data: null })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith({
      where: { id: "config" },
      update: { ...caps, updatedBy: "admin-1" },
      create: { id: "config", ...caps, updatedBy: "admin-1" },
      select: { id: true },
    })
    expect(logAuditEvent).toHaveBeenCalledWith(
      AuditEventType.CONFIG_CHANGED,
      "admin-1",
      expect.objectContaining({
        section: "llm.caps",
        changedFields: ["llmDailyCapPerUserUsd", "llmDailyCapServerUsd"],
        secretChanged: false,
      })
    )
  })

  it.each([
    ["a negative cap", { ...caps, llmDailyCapPerUserUsd: -1 }],
    ["a cap over 1000", { ...caps, llmDailyCapServerUsd: 1001 }],
    ["a missing cap", { llmDailyCapPerUserUsd: 1, llmDailyCapAdminUsd: 1 }],
  ])("refuses %s", async (_label, input) => {
    // The cast stands in for a client that ignores the types
    const result = await updateLlmCaps(input as Parameters<typeof updateLlmCaps>[0])

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("accepts a cap of 0, which turns the assistant off for that tier", async () => {
    expect((await updateLlmCaps({ ...caps, llmDailyCapPerUserUsd: 0 })).success).toBe(true)
  })

  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue(session(false))

    expect(await updateLlmCaps(caps)).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })
})
