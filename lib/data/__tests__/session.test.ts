/**
 * `getSession` (P11.19, BP-31): every guard on a page shares one session read.
 *
 * Jest loads React's client build, whose `cache()` does not memoise, so the
 * mock below stands in for one server render: a memo per cached function,
 * which `newRequest()` clears.
 */

import { getServerSession } from "next-auth"

import { assertAdmin, getAdminGate } from "@/lib/admin"
import { getSession } from "@/lib/data/session"

type Memos = { sessionTestMemos?: Array<Map<string, unknown>> }

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  cache: <T,>(fn: () => T) => {
    const memo = new Map<string, unknown>()
    ;((globalThis as Memos).sessionTestMemos ??= []).push(memo)
    return () => {
      if (!memo.has("value")) memo.set("value", fn())
      return memo.get("value") as T
    }
  },
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))

const session = jest.mocked(getServerSession)
const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }

function newRequest() {
  ;(globalThis as Memos).sessionTestMemos?.forEach((memo) => memo.clear())
}

beforeEach(() => {
  session.mockReset()
  newRequest()
})

describe("getSession", () => {
  it("reads the session once for two guards in one request", async () => {
    session.mockResolvedValue(ADMIN)

    await getAdminGate()
    await assertAdmin()
    await getSession()

    expect(session).toHaveBeenCalledTimes(1)
  })

  it("gives every caller the same session", async () => {
    session.mockResolvedValue(ADMIN)

    const [gate, viewer] = await Promise.all([getAdminGate(), getSession()])

    expect(gate).toEqual({ ok: true, session: ADMIN })
    expect(viewer).toBe(ADMIN)
  })

  it("reads again in the next request", async () => {
    session.mockResolvedValue(ADMIN)
    await getSession()

    newRequest()
    session.mockResolvedValue(null)

    await expect(getAdminGate()).resolves.toEqual({ ok: false, reason: "unauthenticated" })
    expect(session).toHaveBeenCalledTimes(2)
  })
})
