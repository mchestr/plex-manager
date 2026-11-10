/** The admin route builders (P6.1, UI-06): each carries the year it is given and encodes ids. */

import {
  affiliates,
  aiActivity,
  aiActivityConversation,
  aiActivityRecord,
  auditEvent,
  auditLog,
  cleanup,
  CLEANUP_TABS,
  cleanupNewRule,
  cleanupRule,
  cleanupTurnOn,
  invite,
  movedSettingsHome,
  playgroundFor,
  publicInviteUrl,
  rewindHistory,
  settingsSection,
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

  it("sends a settings section to the page it lives on", () => {
    expect(settingsSection("rewind")).toBe("/admin/rewind/settings")
  })

  it("sends Request limits to its own page under Automations", () => {
    expect(settingsSection("request-tiers")).toBe("/admin/request-limits")
  })

  it("anchors a settings section that is still on the settings page, encoding its id", () => {
    expect(settingsSection("tautulli")).toBe("/admin/settings#tautulli")
    expect(settingsSection("stripe")).toBe("/admin/settings#stripe")
    expect(settingsSection("email")).toBe("/admin/settings#email")
    expect(settingsSection("a b/c")).toBe("/admin/settings#a%20b%2Fc")
  })

  it("sends the AI sections to the AI settings page, and the rest to their anchor on Settings", () => {
    expect(settingsSection("ai")).toBe("/admin/ai/settings")
    expect(settingsSection("assistant")).toBe("/admin/ai/settings")
    expect(settingsSection("conversation-review")).toBe("/admin/ai/settings")
    expect(settingsSection("tautulli")).toBe("/admin/settings#tautulli")
    expect(settingsSection("time zone")).toBe("/admin/settings#time%20zone")
  })

  it("builds the public invite link on an origin", () => {
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("AUDIT2026", "https://plex.example.com/")).toBe("https://plex.example.com/invite/AUDIT2026")
    expect(publicInviteUrl("A B", "http://localhost:3000")).toBe("http://localhost:3000/invite/A%20B")
  })

  it("sends the Discord settings sections to their own page", () => {
    expect(settingsSection("discord")).toBe("/admin/discord/settings")
    expect(settingsSection("channel-stats")).toBe("/admin/discord/settings")
  })

  it("keeps any other settings section on the Settings page, by its encoded anchor", () => {
    expect(settingsSection("tautulli")).toBe("/admin/settings#tautulli")
    expect(settingsSection("time-zone")).toBe("/admin/settings#time-zone")
    expect(settingsSection("a b")).toBe("/admin/settings#a%20b")
  })

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])("treats %s as a section id, never as a member inherited from Object", (id) => {
    expect(settingsSection(id)).toBe(`/admin/settings#${id}`)
  })
})

describe("media cleanup routes (UX 3.1)", () => {
  it("builds the page tabs, with the Rules tab left out", () => {
    expect(CLEANUP_TABS).toEqual(["rules", "leaving-soon", "kept", "history", "settings"])
    expect(cleanup()).toBe("/admin/cleanup")
    expect(cleanup({ tab: "rules" })).toBe("/admin/cleanup")
    expect(cleanup({ tab: "leaving-soon" })).toBe("/admin/cleanup?tab=leaving-soon")
    expect(cleanup({ tab: "kept" })).toBe("/admin/cleanup?tab=kept")
    expect(cleanup({ tab: "history" })).toBe("/admin/cleanup?tab=history")
  })

  it("opens a Settings section, with the turn-on page to go back to", () => {
    expect(cleanup({ tab: "settings", section: "cleanup-feature" })).toBe("/admin/cleanup?tab=settings&section=cleanup-feature")
    expect(cleanup({ tab: "settings", section: "cleanup-feature", returnTo: "/admin/cleanup/rules/r-1/turn-on" })).toBe(
      "/admin/cleanup?tab=settings&section=cleanup-feature&returnTo=%2Fadmin%2Fcleanup%2Frules%2Fr-1%2Fturn-on"
    )
  })

  it("builds the rule editor and encodes the id", () => {
    expect(cleanupRule("ckx1a2b3c")).toBe("/admin/cleanup/rules/ckx1a2b3c")
    expect(cleanupRule("a11y-cleanup-rule-live")).toBe("/admin/cleanup/rules/a11y-cleanup-rule-live")
    expect(cleanupRule("a/b c")).toBe("/admin/cleanup/rules/a%2Fb%20c")
  })

  it("builds the new-rule editor for a blank rule and for a recipe with key values", () => {
    expect(cleanupNewRule()).toBe("/admin/cleanup/rules/new")
    expect(cleanupNewRule({ level: "movie" })).toBe("/admin/cleanup/rules/new?level=movie")
    expect(cleanupNewRule({ recipe: "big-shows-nobody-plays", values: { size: "100", lastPlayed: "365" } })).toBe(
      "/admin/cleanup/rules/new?recipe=big-shows-nobody-plays&size=100&lastPlayed=365"
    )
    expect(cleanupNewRule({ recipe: "former-members", level: "show", values: { added: "90 days" } })).toBe(
      "/admin/cleanup/rules/new?recipe=former-members&level=show&added=90+days"
    )
  })

  it("leaves out a key value that would replace the recipe or the level", () => {
    expect(cleanupNewRule({ recipe: "old-seasons", values: { recipe: "x", level: "movie", keepNewest: "2" } })).toBe(
      "/admin/cleanup/rules/new?recipe=old-seasons&keepNewest=2"
    )
  })

  it("builds the turn-on page, with Automatic preselected when asked", () => {
    expect(cleanupTurnOn("r-1")).toBe("/admin/cleanup/rules/r-1/turn-on")
    expect(cleanupTurnOn("r-1", "automatic")).toBe("/admin/cleanup/rules/r-1/turn-on?mode=automatic")
    expect(cleanupTurnOn("a b")).toBe("/admin/cleanup/rules/a%20b/turn-on")
  })

  it("links the audit log to one cleanup run", () => {
    expect(auditLog({ run: "run-1" })).toBe("/admin/audit?run=run-1")
  })
})

describe("movedSettingsHome", () => {
  it.each([
    ["ai", "/admin/ai/settings"],
    ["assistant", "/admin/ai/settings"],
    ["channel-stats", "/admin/discord/settings"],
    ["conversation-review", "/admin/ai/settings"],
    ["discord", "/admin/discord/settings"],
    ["request-tiers", "/admin/request-limits"],
    ["rewind", "/admin/rewind/settings"],
  ])("sends the section %s that moved to %s", (id, home) => {
    expect(movedSettingsHome(id)).toBe(home)
    expect(settingsSection(id)).toBe(home)
  })

  it.each(["plex", "tautulli", "stripe", "time-zone", "system", "", "nowhere"])("has no new home for %j, which is a section of Settings or none", (id) => {
    expect(movedSettingsHome(id)).toBeNull()
  })

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])("has no new home for %s, which Object only inherits", (id) => {
    expect(movedSettingsHome(id)).toBeNull()
  })
})
