/**
 * @jest-environment node
 */

/**
 * The assistant page's loader: refused without `assistant:use`, the caller's
 * own open conversations only, newest first, and whether the assistant can
 * answer.
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertPermission } from "@/lib/admin"
import { getAssistantPage, HISTORY_LIMIT, TRANSCRIPT_LIMIT } from "@/lib/data/assistant-history"
import type { ChatConversation, LLMProvider } from "@/lib/generated/prisma/client"

jest.mock("@/lib/admin", () => ({ assertPermission: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const OWN = { userId: "support-1", endedAt: null, discordSessions: { none: {} } }
const at = new Date("2026-12-01T12:00:00Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertPermission).mockReset().mockResolvedValue({ user: { id: "support-1" } } as never)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ provider: "anthropic" } as LLMProvider)
  prismaMock.chatConversation.findMany.mockResolvedValue([])
})

it("refuses a caller without assistant:use before reading anything", async () => {
  const forbidden = new Error("PM_FORBIDDEN")
  jest.mocked(assertPermission).mockRejectedValue(forbidden)

  await expect(getAssistantPage(null)).rejects.toBe(forbidden)
  expect(assertPermission).toHaveBeenCalledWith("assistant:use")
  expect(prismaMock.chatConversation.findMany).not.toHaveBeenCalled()
})

it("lists the caller's own open conversations, newest first", async () => {
  prismaMock.chatConversation.findMany.mockResolvedValue([
    { id: "c1", title: "Is Sonarr up?", lastMessageAt: at },
    { id: "c2", title: null, lastMessageAt: at },
  ] as ChatConversation[])

  const page = await getAssistantPage(null)

  expect(prismaMock.chatConversation.findMany).toHaveBeenCalledWith({
    where: { ...OWN, lastMessageAt: { not: null } },
    orderBy: { lastMessageAt: "desc" },
    take: HISTORY_LIMIT,
    select: { id: true, title: true, lastMessageAt: true },
  })
  expect(page.history).toEqual([
    { id: "c1", title: "Is Sonarr up?", lastMessageAt: at.getTime() },
    // A title that no longer decrypts
    { id: "c2", title: "Untitled conversation", lastMessageAt: at.getTime() },
  ])
  expect(page.conversation).toBeNull()
  expect(prismaMock.chatConversation.findFirst).not.toHaveBeenCalled()
})

it("opens one of the caller's conversations with its newest messages, oldest first", async () => {
  prismaMock.chatConversation.findFirst.mockResolvedValue({
    id: "c1",
    title: "Is Sonarr up?",
    messages: [
      { role: "assistant", content: "Yes.", sources: null, createdAt: new Date(at.getTime() + 1000) },
      { role: "user", content: "Is Sonarr up?", sources: null, createdAt: at },
    ],
  } as unknown as ChatConversation)

  const page = await getAssistantPage("c1")

  expect(prismaMock.chatConversation.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { ...OWN, id: "c1" } })
  )
  // The newest messages, read newest first and shown oldest first
  expect(prismaMock.chatConversation.findFirst.mock.calls[0][0]?.select?.messages).toMatchObject({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TRANSCRIPT_LIMIT,
  })
  expect(page.conversation).toEqual({
    id: "c1",
    title: "Is Sonarr up?",
    messages: [
      { role: "user", content: "Is Sonarr up?", timestamp: at.getTime() },
      { role: "assistant", content: "Yes.", timestamp: at.getTime() + 1000 },
    ],
  })
})

it("has no conversation for an id that is not the caller's", async () => {
  prismaMock.chatConversation.findFirst.mockResolvedValue(null)

  expect((await getAssistantPage("someone-elses")).conversation).toBeNull()
})

it("names the provider and the retention windows, each from its own setting", async () => {
  process.env.RETENTION_ASSISTANT_CHAT_DAYS = "30"
  try {
    const page = await getAssistantPage(null)

    expect(page).toMatchObject({
      available: true,
      disclosure: "Server admins can review assistant conversations, and messages are processed by Anthropic.",
      usageTextDays: 90,
      historyDays: 30,
    })
  } finally {
    delete process.env.RETENTION_ASSISTANT_CHAT_DAYS
  }
})

it("says when the history reached its limit", async () => {
  const row = { title: "Is Plex up?", lastMessageAt: at }
  prismaMock.chatConversation.findMany.mockResolvedValue(
    Array.from({ length: HISTORY_LIMIT }, (_, i) => ({ ...row, id: `c${i}` })) as ChatConversation[]
  )

  expect((await getAssistantPage(null)).historyCapped).toBe(true)
  prismaMock.chatConversation.findMany.mockResolvedValue([{ ...row, id: "c1" }] as ChatConversation[])
  expect((await getAssistantPage(null)).historyCapped).toBe(false)
})

it.each([
  ["AI features are off", () => prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: true }))],
  ["no chat model is active", () => prismaMock.lLMProvider.findFirst.mockResolvedValue(null)],
])("is not available when %s", async (_label, arrange) => {
  arrange()

  expect((await getAssistantPage(null)).available).toBe(false)
})
