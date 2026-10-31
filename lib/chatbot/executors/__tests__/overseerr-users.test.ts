/**
 * get_overseerr_users reports every user, not the first 10 (GAP-07): it asks
 * for a page of 100 and returns the total with "and N more", and `page`
 * reaches the rest.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Overseerr } from "@/lib/generated/prisma/client"
import { MAX_RESULT_CHARS } from "@/lib/utils/tool-result-limit"

import { executeOverseerrTool } from "../overseerr"
import { MEMBERS, userPage } from "./overseerr-fixtures"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const overseerrRow = { id: "o-1", name: "Overseerr", url: "http://overseerr.lan:5055", apiKey: "key", publicUrl: null, isActive: true } as Overseerr
const mockFetch = jest.fn()

/** The first page of `/user?take=100` on a server with `total` users. */
function firstPage(total: number) {
  const listed = Math.min(total, 100)
  return {
    pageInfo: { pages: Math.ceil(total / 100), pageSize: 100, results: total, page: 1 },
    results: Array.from({ length: listed }, (_, i) => ({
      id: i + 1,
      email: `user${i + 1}@example.invalid`,
      displayName: `User ${i + 1}`,
      requestCount: i % 4,
      permissions: 32,
    })),
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  prismaMock.overseerr.findFirst.mockResolvedValue(overseerrRow)
})

function serve(body: unknown) {
  mockFetch.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => body })
}

it("reports a total of 230 for 230 users, lists the first 100 and says how many more", async () => {
  serve(firstPage(230))

  const output = JSON.parse(await executeOverseerrTool("get_overseerr_users", {}))

  const url = new URL(String(mockFetch.mock.calls[0][0]))
  expect(url.pathname).toBe("/api/v1/user")
  expect(Object.fromEntries(url.searchParams)).toEqual({ take: "100", skip: "0" })
  expect(output.total).toBe(230)
  expect(output.users).toHaveLength(100)
  expect(output.more).toBe("and 130 more")
  expect(JSON.stringify(output)).not.toContain("@example.invalid")
})

it("leaves out 'more' when every user is listed", async () => {
  serve(firstPage(7))

  const output = JSON.parse(await executeOverseerrTool("get_overseerr_users", {}))

  expect(output.total).toBe(7)
  expect(output.users).toHaveLength(7)
  expect(output).not.toHaveProperty("more")
})

/** Answers each `/user?take=&skip=` like a server with `total` users. */
function serveUsers(total: number) {
  mockFetch.mockImplementation(async (url: string) => ({ ok: true, status: 200, headers: new Headers(), json: async () => userPage(new URL(url), total) }))
}

it("names the page that holds the rest, and pages through them", async () => {
  serveUsers(230)

  const first = JSON.parse(await executeOverseerrTool("get_overseerr_users", {}))
  const second = JSON.parse(await executeOverseerrTool("get_overseerr_users", { page: 2 }))

  expect(first.next).toBe("pass page 2 for the next 100")
  expect(Object.fromEntries(new URL(String(mockFetch.mock.calls[1][0])).searchParams)).toEqual({ take: "100", skip: "100" })
  expect(second).toMatchObject({ total: 230, showing: "showing 101-200 of 230", more: "and 30 more", next: "pass page 3 for the next 30" })
  expect(second.users[0].id).toBe(101)
})

it("keeps Overseerr's total on a page past the end and names the last page", async () => {
  serveUsers(MEMBERS)

  const output = JSON.parse(await executeOverseerrTool("get_overseerr_users", { page: 9 }))

  expect(output).toEqual({ total: MEMBERS, showing: "page 9 is past the end (last page 5)", users: [] })
})

it("never shows an email as a display name, which Overseerr does for a user with no username", async () => {
  serve({ pageInfo: { results: 1 }, results: [{ id: 3, email: "sam@example.invalid", displayName: "sam@example.invalid", requestCount: 1, permissions: 2 }] })

  const output = await executeOverseerrTool("get_overseerr_users", {})

  expect(JSON.parse(output).users).toEqual([{ id: 3, displayName: "user 3", requestCount: 1, permissions: 2 }])
  expect(output).not.toContain("@example.invalid")
})

it.each([1, 5])("keeps page %i of 500 members within an MCP result (40,000 characters)", async (page) => {
  serveUsers(MEMBERS)

  const output = await executeOverseerrTool("get_overseerr_users", { page })

  expect(output.length).toBeLessThanOrEqual(MAX_RESULT_CHARS)
  expect(JSON.parse(output).users).toHaveLength(100)
})
