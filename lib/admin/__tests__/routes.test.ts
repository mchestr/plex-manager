/** The admin route builders (P6.1, UI-06): each carries the year it is given and encodes ids. */

import {
  affiliates,
  aiActivity,
  aiActivityConversation,
  aiActivityRecord,
  auditEvent,
  auditLog,
  invite,
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

  it("filters AI activity by member and year when given", () => {
    expect(aiActivity()).toBe("/admin/ai")
    expect(aiActivity({ userId: "u1" })).toBe("/admin/ai?userId=u1")
    expect(aiActivity({ userId: "u1", year: 2025 })).toBe("/admin/ai?userId=u1&year=2025")
    expect(aiActivity({ from: "2026-10-01", to: "2026-10-31" })).toBe("/admin/ai?from=2026-10-01&to=2026-10-31")
    expect(aiActivityConversation("c/1")).toBe("/admin/ai/conversation/c%2F1")
    expect(aiActivityConversation("c/1", "f 1")).toBe("/admin/ai/conversation/c%2F1#finding-f%201")
  })

  it("aiActivity builds view=findings with the findings filters", () => {
    expect(aiActivity({ view: "findings" })).toBe("/admin/ai?view=findings")
    expect(aiActivity({ purpose: "judge" })).toBe("/admin/ai?purpose=judge")
    expect(
      aiActivity({ view: "findings", type: "wrong_tool", severity: "high", tool: "get a&b", status: "fixed", from: "2026-10-01", to: "2026-10-31" })
    ).toBe("/admin/ai?view=findings&type=wrong_tool&severity=high&tool=get+a%26b&status=fixed&from=2026-10-01&to=2026-10-31")
    // A group with no tool links to findings that name none
    expect(aiActivity({ view: "findings", type: "misread_question", tool: "" })).toBe("/admin/ai?view=findings&type=misread_question&tool=")
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
    expect(aiActivityRecord("l1")).toBe("/admin/ai/l1")
    expect(invite("i1")).toBe("/admin/invites/i1")
    expect(rewindHistory("w1", "l1")).toBe("/admin/wrapped/w1/history/l1")
    expect(auditEvent("e1")).toBe("/admin/audit/e1")
  })

  it("encodes ids", () => {
    expect(userDetail("a/b?c")).toBe("/admin/users/a%2Fb%3Fc")
    expect(userRewind("a b", 2025)).toBe("/admin/users/a%20b/rewind/2025")
    expect(aiActivity({ userId: "a&b" })).toBe("/admin/ai?userId=a%26b")
    expect(rewindHistory("w/1", "l#1")).toBe("/admin/wrapped/w%2F1/history/l%231")
    expect(invite("x/y")).toBe("/admin/invites/x%2Fy")
    expect(aiActivityRecord("x y")).toBe("/admin/ai/x%20y")
    expect(auditEvent("e/1")).toBe("/admin/audit/e%2F1")
  })

  it("builds the public invite link on an origin", () => {
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com/")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("A B", "http://localhost:3000")).toBe("http://localhost:3000/invite/A%20B")
  })
})
