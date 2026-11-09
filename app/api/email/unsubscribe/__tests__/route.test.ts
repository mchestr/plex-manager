/**
 * @jest-environment node
 *
 * The RFC 8058 one-click address (app/api/email/unsubscribe/route.ts): a POST
 * with `List-Unsubscribe=One-Click` and a good token turns the emails off; a
 * GET only sends the browser to the page; nothing here turns them on.
 */

import { NextRequest, NextResponse } from "next/server"

import { GET, POST } from "@/app/api/email/unsubscribe/route"
import { serverName } from "@/lib/brand"
import { saveAccessReminders } from "@/lib/email/access-reminders"
import { limitRequest } from "@/lib/security/rate-limit"
import { signUnsubscribeToken } from "@/lib/security/unsubscribe-token"
import { createLogger } from "@/lib/utils/logger"

jest.mock("@/lib/email/access-reminders", () => ({ saveAccessReminders: jest.fn() }))
jest.mock("@/lib/brand", () => ({ serverName: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ limitRequest: jest.fn() }))
jest.mock("@/lib/env", () => ({ ...jest.requireActual("@/lib/env"), getBaseUrl: () => "https://plex.example.com" }))
jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

const logger = createLogger("EMAIL")
const FORM = "application/x-www-form-urlencoded"
const URL_BASE = "https://plex.example.com/api/email/unsubscribe"

function post(
  token: string | null,
  body: BodyInit | null = "List-Unsubscribe=One-Click",
  headers: Record<string, string> = { "Content-Type": FORM },
  extra = ""
) {
  const url = token === null ? `${URL_BASE}${extra && `?${extra.slice(1)}`}` : `${URL_BASE}?token=${encodeURIComponent(token)}${extra}`
  return POST(new NextRequest(url, { method: "POST", body, headers }))
}

const DONE = "Done. We will not send you these emails. To turn them on again, sign in to Northfield Plex and open Account."
const DEAD_LINK = "This link no longer works. Sign in to Northfield Plex and open Account to choose your emails."

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(limitRequest).mockResolvedValue(null)
  jest.mocked(saveAccessReminders).mockResolvedValue("changed")
  jest.mocked(serverName).mockResolvedValue("Northfield Plex")
})

describe("POST", () => {
  it("turns off the emails of the token's member and answers 200, uncached", async () => {
    const token = signUnsubscribeToken("member-1")
    const response = await post(token)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(await response.text()).toBe(DONE)
    expect(saveAccessReminders).toHaveBeenCalledWith("member-1", { enabled: false, via: "one_click" })
    expect(limitRequest).toHaveBeenCalledWith("email:unsubscribe", expect.any(Request))
    expect(logger.info).toHaveBeenCalledWith("email.unsubscribed", { userId: "member-1", via: "one_click", changed: true })
    expect(JSON.stringify(jest.mocked(logger.info).mock.calls)).not.toContain(token)
  })

  it("answers 200 again when the emails were off already", async () => {
    jest.mocked(saveAccessReminders).mockResolvedValue("unchanged")

    expect((await post(signUnsubscribeToken("member-1"))).status).toBe(200)
  })

  it("takes a multipart body", async () => {
    const form = new FormData()
    form.set("List-Unsubscribe", "One-Click")

    expect((await post(signUnsubscribeToken("member-1"), form, {})).status).toBe(200)
  })

  it.each([
    ["no token", null],
    ["a changed token", `${signUnsubscribeToken("member-1")}x`],
    ["a token for another purpose", "eyJ1IjoibWVtYmVyLTEiLCJleHAiOjk5OTk5OTk5OTl9.c2lnbmF0dXJl"],
    ["a token that is too long", "a".repeat(600)],
  ])("refuses %s with a bare 400 and changes nothing", async (_case, token) => {
    const response = await post(token)

    expect(response.status).toBe(400)
    expect(await response.text()).toBe("Bad request")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("refuses the token of a removed member", async () => {
    jest.mocked(saveAccessReminders).mockResolvedValue("no_member")

    expect((await post(signUnsubscribeToken("gone"))).status).toBe(400)
    expect(logger.warn).toHaveBeenCalledWith("email.unsubscribe_refused", { via: "one_click", reason: "no_member" })
  })

  it.each([
    ["no body", null],
    ["another value", "List-Unsubscribe=Yes"],
    ["another field", "unsubscribe=One-Click"],
    ["a malformed multipart body", "--x\r\nnot a part"],
  ])("refuses %s with 400", async (_case, body) => {
    const headers = body?.startsWith("--") ? { "Content-Type": "multipart/form-data; boundary=x" } : { "Content-Type": FORM }
    const response = await post(signUnsubscribeToken("member-1"), body, headers)

    expect(response.status).toBe(400)
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("refuses a body over 1 KB, by its Content-Length or as it is read", async () => {
    const token = signUnsubscribeToken("member-1")
    const big = `List-Unsubscribe=One-Click&pad=${"a".repeat(2000)}`

    expect((await post(token, big, { "Content-Type": FORM, "Content-Length": String(big.length) })).status).toBe(400)

    // No Content-Length on the request: the cap applies as the body is read
    expect((await post(token, big)).status).toBe(400)
    expect(logger.warn).toHaveBeenCalledWith("email.unsubscribe_refused", { via: "one_click", reason: "body_too_large" })
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it.each([["application/json"], ["text/plain"], [""]])("refuses a %s body with 415", async (contentType) => {
    const response = await post(signUnsubscribeToken("member-1"), "List-Unsubscribe=One-Click", { "Content-Type": contentType })

    expect(response.status).toBe(415)
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("refuses a POST with no body and no Content-Type with 415", async () => {
    expect((await post(signUnsubscribeToken("member-1"), null, {})).status).toBe(415)
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("stops at the rate limit, before reading the token", async () => {
    jest.mocked(limitRequest).mockResolvedValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }))

    const response = await post(signUnsubscribeToken("member-1"))

    expect(response.status).toBe(429)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })
})

describe("POST from the unsubscribe page without JavaScript (source=page)", () => {
  it("audits and logs the change as the link, and answers with the Done text", async () => {
    const response = await post(signUnsubscribeToken("member-1"), undefined, undefined, "&source=page")

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(DONE)
    expect(saveAccessReminders).toHaveBeenCalledWith("member-1", { enabled: false, via: "link" })
    expect(logger.info).toHaveBeenCalledWith("email.unsubscribed", { userId: "member-1", via: "link", changed: true })
  })

  it.each([
    ["no token", null],
    ["a changed token", `${signUnsubscribeToken("member-1")}x`],
  ])("answers %s with the dead-link text", async (_case, token) => {
    const response = await post(token, undefined, undefined, "&source=page")

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(DEAD_LINK)
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })

  it("answers a removed member with the dead-link text", async () => {
    jest.mocked(saveAccessReminders).mockResolvedValue("no_member")

    const response = await post(signUnsubscribeToken("gone"), undefined, undefined, "&source=page")

    expect(response.status).toBe(400)
    expect(await response.text()).toBe(DEAD_LINK)
    expect(logger.warn).toHaveBeenCalledWith("email.unsubscribe_refused", { via: "link", reason: "no_member" })
  })

  it("keeps a bad body a bare 400, and another source the mail app's button", async () => {
    const token = signUnsubscribeToken("member-1")

    const bad = await post(token, "List-Unsubscribe=Yes", undefined, "&source=page")
    expect(bad.status).toBe(400)
    expect(await bad.text()).toBe("Bad request")
    expect(logger.warn).toHaveBeenCalledWith("email.unsubscribe_refused", { via: "link", reason: "not_one_click" })

    expect((await post(token, undefined, undefined, "&source=mail")).status).toBe(200)
    expect(saveAccessReminders).toHaveBeenCalledWith("member-1", { enabled: false, via: "one_click" })
  })
})

describe("GET", () => {
  it("sends the browser to the page with the token and changes nothing", async () => {
    const token = signUnsubscribeToken("member-1")
    const response = await GET(new NextRequest(`${URL_BASE}?token=${token}`))

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(`https://plex.example.com/email/unsubscribe?token=${token}`)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(saveAccessReminders).not.toHaveBeenCalled()
    expect(limitRequest).not.toHaveBeenCalled()
  })

  it.each([
    ["no token", URL_BASE],
    ["a token of another shape", `${URL_BASE}?token=%3Cscript%3E`],
    ["a token that is too long", `${URL_BASE}?token=${"a".repeat(300)}.${"b".repeat(300)}`],
  ])("drops %s from the redirect", async (_case, url) => {
    const response = await GET(new NextRequest(url))

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("https://plex.example.com/email/unsubscribe")
    expect(saveAccessReminders).not.toHaveBeenCalled()
  })
})
