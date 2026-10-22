/**
 * The LLM usage loaders audit an admin's read of one member's prompts
 * (P11.16, GAP-33): a record and a conversation, never the plain list.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getLLMUsageById, getLLMUsageRecords } from "@/lib/data/llm-usage"
import { auditMemberRead } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditMemberRead: jest.fn() }))

const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const USAGE_ID = "clusage0000000000000000001"

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  prismaMock.lLMUsage.count.mockResolvedValue(1)
})

describe("getLLMUsageRecords", () => {
  it("audits a conversation as a read of its member's content", async () => {
    prismaMock.lLMUsage.findMany.mockResolvedValue([{ id: "u1", userId: "member-1" }] as never)

    await getLLMUsageRecords({ conversationId: "conversation-1" })

    expect(auditMemberRead).toHaveBeenCalledWith("llm-conversation", "member-1", "admin-1")
  })

  it("does not audit the plain list, or an empty conversation", async () => {
    prismaMock.lLMUsage.findMany.mockResolvedValue([{ id: "u1", userId: "member-1" }] as never)
    await getLLMUsageRecords({})

    prismaMock.lLMUsage.findMany.mockResolvedValue([])
    await getLLMUsageRecords({ conversationId: "conversation-2" })

    expect(auditMemberRead).not.toHaveBeenCalled()
  })
})

describe("getLLMUsageById", () => {
  it("audits the record's member", async () => {
    prismaMock.lLMUsage.findUnique.mockResolvedValue({ id: USAGE_ID, userId: "member-2" } as never)

    await getLLMUsageById(USAGE_ID)

    expect(auditMemberRead).toHaveBeenCalledWith("llm-usage-detail", "member-2", "admin-1")
  })

  it("does not audit an unknown record", async () => {
    prismaMock.lLMUsage.findUnique.mockResolvedValue(null)

    expect(await getLLMUsageById(USAGE_ID)).toBeNull()
    expect(auditMemberRead).not.toHaveBeenCalled()
  })
})
