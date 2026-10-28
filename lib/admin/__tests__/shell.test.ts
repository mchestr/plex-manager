/**
 * @jest-environment node
 */

/**
 * The admin shell's data (`getAdminShellData`): which nav items the user may
 * open, with Assistant only while AI features are on and a chat model is
 * active, for an admin and for a Support user alike.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getAdminShellData } from "@/lib/admin/shell"
import type { LLMProvider } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/admin/nav-counts", () => ({
  getAdminNavCounts: jest.fn().mockResolvedValue({ users: 7, activeInvites: 3, failedJobs: 0 }),
}))

const admin = { id: "admin-1", name: "Dana Whitfield", isAdmin: true }
const support = { id: "support-1", name: "Sam Rivera", isAdmin: false, role: "support" }

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "chat-1" } as LLMProvider)
})

it.each([
  ["an admin", admin],
  ["a Support user", support],
])("lists Assistant for %s while AI features are on and a chat model is active", async (_label, session) => {
  expect((await getAdminShellData(session)).navIds).toContain("assistant")
})

it.each([
  ["AI features are off", () => prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))],
  ["no chat model is active", () => prismaMock.lLMProvider.findFirst.mockResolvedValue(null)],
])("leaves Assistant out when %s, for an admin and a Support user", async (_label, arrange) => {
  arrange()

  expect((await getAdminShellData(admin)).navIds).not.toContain("assistant")
  expect((await getAdminShellData(support)).navIds).toEqual(["users"])
})

it("looks up the active chat model", async () => {
  await getAdminShellData(admin)

  expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: "chat" }, select: { id: true } })
})
