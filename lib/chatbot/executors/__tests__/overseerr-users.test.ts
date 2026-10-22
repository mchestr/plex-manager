/**
 * get_overseerr_users reports every user, not the first 10 (GAP-07): it asks
 * for a page of 100 and returns the total with "and N more".
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { Overseerr } from "@/lib/generated/prisma/client"

import { executeOverseerrTool } from "../overseerr"

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
