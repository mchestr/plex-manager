/**
 * @jest-environment node
 */

/**
 * The old admin viewer's address (P7.9) redirects to the preview with the
 * year in the path: `?year=` first, else the member's latest completed year,
 * else the season year.
 */

import { redirect } from "next/navigation"

import UserWrappedRedirect from "@/app/admin/users/[userId]/wrapped/page"
import { getAdminGate } from "@/lib/admin"
import { getSeasonYear, listCompletedRewindYears } from "@/lib/wrapped/season"

jest.mock("@/lib/admin", () => ({ getAdminGate: jest.fn() }))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonYear: jest.fn(), listCompletedRewindYears: jest.fn() }))
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

function visit(search: { year?: string }, userId = "member-1") {
  return UserWrappedRedirect({ params: Promise.resolve({ userId }), searchParams: Promise.resolve(search) })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: { user: { id: "admin-1", isAdmin: true } } } as never)
  jest.mocked(getSeasonYear).mockResolvedValue(2026)
  jest.mocked(listCompletedRewindYears).mockResolvedValue([2025, 2024])
})

it("keeps ?year=2025 in the path", async () => {
  await expect(visit({ year: "2025" })).rejects.toThrow("NEXT_REDIRECT /admin/users/member-1/rewind/2025")
  expect(listCompletedRewindYears).not.toHaveBeenCalled()
})

it("opens the latest completed year when the link has none", async () => {
  await expect(visit({})).rejects.toThrow("NEXT_REDIRECT /admin/users/member-1/rewind/2025")
  expect(redirect).toHaveBeenCalledTimes(1)
})

it("falls back to the season year for a member with no completed year", async () => {
  jest.mocked(listCompletedRewindYears).mockResolvedValue([])
  await expect(visit({})).rejects.toThrow("NEXT_REDIRECT /admin/users/member-1/rewind/2026")
})

it("ignores a malformed year and never looks up years for a non-admin", async () => {
  jest.mocked(getAdminGate).mockResolvedValue({ ok: false, reason: "forbidden" })
  await expect(visit({ year: "abc" })).rejects.toThrow("NEXT_REDIRECT /admin/users/member-1/rewind/2026")
  expect(listCompletedRewindYears).not.toHaveBeenCalled()
})

it("404s an id that is not a row id", async () => {
  await expect(visit({}, "../x")).rejects.toThrow("NEXT_NOT_FOUND")
})
