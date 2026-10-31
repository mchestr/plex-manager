/** The admin route builders (P6.1, UI-06): each carries the year it is given and encodes ids. */

import {
  affiliates,
  auditEvent,
  auditLog,
  invite,
  llmConversation,
  llmUsage,
  llmUsageDetail,
  playgroundFor,
  publicInviteUrl,
  rewindHistory,
  userDetail,
  userRewind,
} from "@/lib/admin/routes"

describe("admin routes", () => {
  it("builds the Affiliates page, with the default tab left out", () => {
    expect(affiliates()).toBe("/admin/affiliates")
    expect(affiliates({ tab: "applications" })).toBe("/admin/affiliates")
    expect(affiliates({ tab: "history" })).toBe("/admin/affiliates?tab=history")
  })

  it("builds the user pages, with the year on the Rewind link", () => {
    expect(userDetail("u1")).toBe("/admin/users/u1")
    expect(userDetail("u1", { tab: "overview" })).toBe("/admin/users/u1")
    expect(userDetail("u1", { tab: "rewind" })).toBe("/admin/users/u1?tab=rewind")
    expect(userDetail("u1", { tab: "audit" })).toBe("/admin/users/u1?tab=audit")
    expect(userRewind("u1", 2025)).toBe("/admin/users/u1/rewind/2025")
    expect(userRewind("u1", 2026)).toBe("/admin/users/u1/rewind/2026")
    expect(playgroundFor("u 1")).toBe("/admin/rewind/playground?subject=u%201")
  })

  it("filters LLM usage by member and year when given", () => {
    expect(llmUsage()).toBe("/admin/llm-usage")
    expect(llmUsage({ userId: "u1" })).toBe("/admin/llm-usage?userId=u1")
    expect(llmUsage({ userId: "u1", year: 2025 })).toBe("/admin/llm-usage?userId=u1&year=2025")
    expect(llmUsage({ from: "2026-10-01", to: "2026-10-31" })).toBe("/admin/llm-usage?from=2026-10-01&to=2026-10-31")
    expect(llmConversation("c/1")).toBe("/admin/llm-usage/conversation/c%2F1")
  })

  it("filters the audit log, leaving out each empty filter, in a fixed order", () => {
    expect(auditLog()).toBe("/admin/audit")
    expect(auditLog({ member: "u1" })).toBe("/admin/audit?member=u1")
    expect(auditLog({ to: "2026-10-31", run: "r1", actor: "system", category: "access", type: "MEMBER_UNSHARED", member: "", from: "2026-10-01" })).toBe(
      "/admin/audit?category=access&type=MEMBER_UNSHARED&actor=system&run=r1&from=2026-10-01&to=2026-10-31"
    )
    expect(auditLog({ actor: "a&b c" })).toBe("/admin/audit?actor=a%26b+c")
  })

  it("builds the detail pages", () => {
    expect(llmUsageDetail("l1")).toBe("/admin/llm-usage/l1")
    expect(invite("i1")).toBe("/admin/invites/i1")
    expect(rewindHistory("w1", "l1")).toBe("/admin/wrapped/w1/history/l1")
    expect(auditEvent("e1")).toBe("/admin/audit/e1")
  })

  it("encodes ids", () => {
    expect(userDetail("a/b?c")).toBe("/admin/users/a%2Fb%3Fc")
    expect(userRewind("a b", 2025)).toBe("/admin/users/a%20b/rewind/2025")
    expect(llmUsage({ userId: "a&b" })).toBe("/admin/llm-usage?userId=a%26b")
    expect(rewindHistory("w/1", "l#1")).toBe("/admin/wrapped/w%2F1/history/l%231")
    expect(invite("x/y")).toBe("/admin/invites/x%2Fy")
    expect(llmUsageDetail("x y")).toBe("/admin/llm-usage/x%20y")
    expect(auditEvent("e/1")).toBe("/admin/audit/e%2F1")
  })

  it("builds the public invite link on an origin", () => {
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com/")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("A B", "http://localhost:3000")).toBe("http://localhost:3000/invite/A%20B")
  })
})
