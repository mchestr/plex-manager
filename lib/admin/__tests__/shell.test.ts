/**
 * @jest-environment node
 */

/**
 * The admin shell's data (`getAdminShellData`): the nav items the user may
 * open and the tabs they may open on each, with Assistant while AI features
 * are on and a chat model is active, and while they are off only to a user
 * with saved conversations to read or delete there; and the counts a role
 * sees. How a role's folded items resolve is in `shell-nav.test.ts`.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ADMIN_NAV } from "@/lib/admin/nav"
import { getAdminShellData } from "@/lib/admin/shell"
import type { ChatConversation, LLMProvider } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/admin/nav-counts", () => ({
  getAdminNavCounts: jest.fn().mockResolvedValue({ users: 7, activeInvites: 3, pendingAffiliates: 2, failedJobs: 0 }),
}))

const admin = { id: "admin-1", name: "Dana Whitfield", isAdmin: true }
const support = { id: "support-1", name: "Sam Rivera", isAdmin: false, role: "support" }
const member = { id: "member-1", name: "Ada", isAdmin: false, role: null }

/** The ids of the nav entries the shell sends for `session`. */
async function entryIds(session: Parameters<typeof getAdminShellData>[0]): Promise<string[]> {
  return (await getAdminShellData(session)).nav.map((entry) => entry.id)
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "chat-1" } as LLMProvider)
  prismaMock.chatConversation.findFirst.mockResolvedValue(null)
})

it("lists Assistant while AI features are on and a chat model is active, without reading the history", async () => {
  expect(await entryIds(admin)).toContain("assistant")
  expect(await entryIds(support)).toEqual(["assistant", "members", "audit"])
  expect(prismaMock.chatConversation.findFirst).not.toHaveBeenCalled()
})

it("sends an admin every item at its own href, with the ids of every tab it has", async () => {
  const { nav } = await getAdminShellData(admin)

  expect(nav).toEqual(ADMIN_NAV.map((item) => ({ id: item.id, href: item.href, childIds: item.children?.map((child) => child.id) ?? [] })))
  expect(nav.find((entry) => entry.id === "automations")).toEqual({
    id: "automations",
    href: "/admin/watchlist",
    childIds: ["watchlist", "inactivity", "request-limits", "queues"],
  })
  expect(nav.find((entry) => entry.id === "overview")).toEqual({ id: "overview", href: "/admin", childIds: [] })
})

it("sends Support the Members item at its first permitted tab, without the Invites tab", async () => {
  const { nav } = await getAdminShellData(support)

  expect(nav.find((entry) => entry.id === "members")).toEqual({ id: "members", href: "/admin/users", childIds: ["users", "affiliates"] })
})

it.each([
  ["AI features are off", () => prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))],
  ["no chat model is active", () => prismaMock.lLMProvider.findFirst.mockResolvedValue(null)],
])("while %s, lists Assistant only for a user with saved conversations", async (_label, arrange) => {
  arrange()

  expect(await entryIds(support)).toEqual(["members", "audit"])
  expect(prismaMock.chatConversation.findFirst).toHaveBeenCalledWith({
    where: { userId: "support-1", endedAt: null, discordSessions: { none: {} }, lastMessageAt: { not: null } },
    select: { id: true },
  })

  prismaMock.chatConversation.findFirst.mockResolvedValue({ id: "c1" } as ChatConversation)
  expect(await entryIds(support)).toEqual(["assistant", "members", "audit"])
  expect(await entryIds(admin)).toContain("assistant")
})

it("reads nothing about the assistant for a member without assistant:use", async () => {
  expect(await entryIds(member)).toEqual([])
  expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
})

it("gives a role the member count, and the pending applications with affiliates:read", async () => {
  expect((await getAdminShellData(support)).navCounts).toEqual({ users: 7, activeInvites: 0, pendingAffiliates: 2, failedJobs: null })
  expect((await getAdminShellData(member)).navCounts).toEqual({ users: 7, activeInvites: 0, pendingAffiliates: 0, failedJobs: null })
  expect((await getAdminShellData(admin)).navCounts).toEqual({ users: 7, activeInvites: 3, pendingAffiliates: 2, failedJobs: 0 })
})
