/**
 * @jest-environment node
 *
 * The unsubscribe page's button (actions/email-unsubscribe.ts): public, keyed
 * by address, and the token can only turn the emails off.
 */

import { getServerSession } from "next-auth"

import { unsubscribeWithToken } from "@/actions/email-unsubscribe"
import { saveAccessReminders } from "@/lib/email/access-reminders"
import { actionClientIp, consume } from "@/lib/security/rate-limit"
import { signUnsubscribeToken } from "@/lib/security/unsubscribe-token"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/email/access-reminders", () => ({ saveAccessReminders: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(null)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(actionClientIp).mockResolvedValue("203.0.113.0")
  jest.mocked(saveAccessReminders).mockResolvedValue("changed")
})

describe("unsubscribeWithToken", () => {
  it("turns off the emails of the member the token names, with no sign-in", async () => {
    await expect(unsubscribeWithToken({ token: signUnsubscribeToken("member-1") })).resolves.toEqual({ success: true, data: null })

    expect(saveAccessReminders).toHaveBeenCalledWith("member-1", { enabled: false, via: "link" })
    expect(consume).toHaveBeenCalledWith("email:unsubscribe", "203.0.113.0")
  })

  it("acts on the token's member, never the signed-in user's", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "someone-else", isAdmin: false } })

    await unsubscribeWithToken({ token: signUnsubscribeToken("member-1") })

    expect(saveAccessReminders).toHaveBeenCalledWith("member-1", { enabled: false, via: "link" })
    expect(consume).toHaveBeenCalledWith("email:unsubscribe", "203.0.113.0")
  })

  it("succeeds when the emails were off already", async () => {
    jest.mocked(saveAccessReminders).mockResolvedValue("unchanged")

    await expect(unsubscribeWithToken({ token: signUnsubscribeToken("member-1") })).resolves.toEqual({ success: true, data: null })
  })

  it.each([
    ["a changed token", `${signUnsubscribeToken("member-1")}x`],
    ["text that is no token", "abc"],
  ])("refuses %s with NOT_FOUND and changes nothing", async (_case, token) => {
    await expect(unsubscribeWithToken({ token })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("refuses the token of a removed member", async () => {
    jest.mocked(saveAccessReminders).mockResolvedValue("no_member")

    await expect(unsubscribeWithToken({ token: signUnsubscribeToken("gone") })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
  })

  it("refuses an input with more than the token", async () => {
    const result = await unsubscribeWithToken({ token: signUnsubscribeToken("member-1"), enabled: true } as { token: string })

    expect(result).toMatchObject({ success: false, code: "VALIDATION" })
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("stops at the rate limit", async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 60 })

    await expect(unsubscribeWithToken({ token: signUnsubscribeToken("member-1") })).resolves.toMatchObject({ success: false, code: "RATE_LIMITED" })
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })
})
