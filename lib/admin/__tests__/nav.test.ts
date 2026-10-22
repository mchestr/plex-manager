/**
 * The admin nav config (P6.1, ui-design-system 6.2): unique ids, sentence-case
 * Rewind copy, the active rule, the mobile tabs and the immersive routes.
 */

import type { Route } from "next"

import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  activeItem,
  isActive,
  isAssistantHidden,
  isImmersive,
  isTabActive,
  mobileTabs,
  navTestId,
  titleFor,
  type AdminNavItem,
  type MobileLinkTab,
} from "@/lib/admin/nav"

const byId = (id: string) => ADMIN_NAV.find((item) => item.id === id) as AdminNavItem

describe("ADMIN_NAV", () => {
  it("has unique ids, hrefs and test ids", () => {
    const ids = ADMIN_NAV.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ADMIN_NAV.map((item) => item.href)).size).toBe(ids.length)
    expect(new Set(ADMIN_NAV.map(navTestId)).size).toBe(ids.length)
  })

  it("keeps the test ids the E2E specs use", () => {
    for (const id of ["overview", "users", "invites", "share-analytics", "announcements", "llm-usage", "cost-analysis", "discord", "queues", "season", "prompts", "playground", "gallery", "evals", "settings"]) {
      expect(ADMIN_NAV.map(navTestId)).toContain(`admin-nav-${id}`)
    }
  })

  it("labels in sentence case, and never says Wrapped", () => {
    for (const { label } of ADMIN_NAV) {
      const [first, ...rest] = label.split(" ")
      expect(first[0]).toBe(first[0].toUpperCase())
      for (const word of rest) expect(word === word.toLowerCase() || word === word.toUpperCase()).toBe(true)
      expect(label).not.toMatch(/Wrapped/)
    }
  })

  it("lists the groups in the 6.2 order", () => {
    expect(ADMIN_NAV_GROUPS).toEqual(["Community", "Rewind", "Usage and cost", "System"])
    const order = ADMIN_NAV.map((item) => ADMIN_NAV_GROUPS.indexOf(item.group as never))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it("badges members, active invites and failed jobs", () => {
    const counts = { users: 7, activeInvites: 3, failedJobs: 2 }
    expect(byId("users").badge?.(counts)).toEqual({ text: "7" })
    expect(byId("invites").badge?.(counts)).toEqual({ text: "3 active" })
    expect(byId("queues").badge?.(counts)).toEqual({ text: "2 failed", tone: "destructive" })
    expect(byId("invites").badge?.({ ...counts, activeInvites: 0 })).toBeNull()
    expect(byId("queues").badge?.({ ...counts, failedJobs: 0 })).toBeNull()
    expect(byId("queues").badge?.({ ...counts, failedJobs: null })).toBeNull()
  })
})

describe("isActive", () => {
  it.each([
    ["users", "/admin/users", true],
    ["users", "/admin/users/abc", true],
    ["users", "/admin/users-archive", false],
    ["prompts", "/admin/prompts/p1/edit", true],
    ["prompts", "/admin/rewind/playground", false],
    ["playground", "/admin/rewind/playground", true],
    ["season", "/admin/rewind/playground", false],
    ["invites", "/admin/invites/i1", true],
    ["settings", "/admin/users", false],
  ])("%s on %s is %s", (id, pathname, expected) => {
    expect(isActive(byId(id), pathname)).toBe(expected)
  })

  it("an exact item lights only on its own path", () => {
    const exact = { href: "/admin" as Route, match: "exact" as const }
    expect(isActive(exact, "/admin")).toBe(true)
    expect(isActive(exact, "/admin/users")).toBe(false)
  })
})

describe("titleFor", () => {
  it("is the nav label, the deepest match, or Admin off the nav", () => {
    expect(titleFor("/admin/users/abc")).toBe("Users")
    expect(titleFor("/admin/shares")).toBe("Share analytics")
    expect(titleFor("/admin/wrapped/w1/history/u1")).toBe("Admin")
    expect(activeItem("/admin/llm-usage/conversation/c1")?.id).toBe("llm-usage")
  })
})

describe("mobileTabs", () => {
  it("shows Overview, Users, Rewind, Settings and More, with the Rewind tab on Season (P10.8)", () => {
    const tabs = mobileTabs()
    expect(tabs.map((tab) => tab.label)).toEqual(["Overview", "Users", "Rewind", "Settings", "More"])
    const rewind = tabs.find((tab) => tab.id === "rewind") as MobileLinkTab
    expect(rewind.href).toBe("/admin/rewind")
    expect(isTabActive(rewind, "/admin/rewind")).toBe(true)
    expect(isTabActive(rewind, "/admin/rewind/playground")).toBe(true)
    expect(isTabActive(rewind, "/admin/shares")).toBe(true)
    expect(isTabActive(rewind, "/admin/users")).toBe(false)
  })

  it("lights the Overview tab only on /admin", () => {
    const overview = mobileTabs()[0] as MobileLinkTab
    expect(overview.href).toBe("/admin")
    expect(isTabActive(overview, "/admin")).toBe(true)
    expect(isTabActive(overview, "/admin/users")).toBe(false)
  })
})

describe("Overview (P10.8)", () => {
  it("is the first item, ungrouped, exact and a mobile tab", () => {
    expect(ADMIN_NAV[0]).toMatchObject({ id: "overview", label: "Overview", href: "/admin", group: null, match: "exact", mobile: "tab" })
    expect(titleFor("/admin")).toBe("Overview")
  })

  it("leaves Users unlit on /admin", () => {
    expect(isActive(byId("users"), "/admin")).toBe(false)
    expect(activeItem("/admin")?.id).toBe("overview")
    expect(activeItem("/admin/users")?.id).toBe("users")
  })
})

describe("isAssistantHidden", () => {
  it.each([
    ["/admin/users/u1/rewind/2025", true],
    ["/admin/wrapped/w1/history/l1", true],
    ["/admin/users/u1/wrapped", false],
    ["/admin/users/u1", false],
    ["/admin/users", false],
    ["/admin/rewind/playground", true],
    ["/admin/rewind", false],
  ])("%s is %s", (pathname, expected) => {
    expect(isAssistantHidden(pathname)).toBe(expected)
  })
})

describe("isImmersive", () => {
  it.each([
    // The admin Rewind preview keeps the nav (P7.9): only the assistant steps aside.
    ["/admin/users/u1/rewind/2025", false],
    ["/admin/wrapped/w1/history/l1", true],
    ["/admin/users/u1", false],
  ])("%s is %s", (pathname, expected) => {
    expect(isImmersive(pathname)).toBe(expected)
  })
})
