/**
 * The admin nav config (P6.1, ui-design-system 6.2): unique ids, sentence-case
 * Rewind copy, the active rule, the mobile tabs, the Assistant item and the
 * immersive routes.
 */

import type { Route } from "next"

import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  activeItem,
  childrenOf,
  isActive,
  isImmersive,
  isTabActive,
  mobileTabs,
  navFor,
  navTestId,
  titleFor,
  type AdminNavItem,
  type MobileLinkTab,
} from "@/lib/admin/nav"
import { icons } from "@/lib/ui/icons"

const byId = (id: string) => ADMIN_NAV.find((item) => item.id === id) as AdminNavItem

describe("ADMIN_NAV", () => {
  it("has unique ids, hrefs and test ids", () => {
    const ids = ADMIN_NAV.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ADMIN_NAV.map((item) => item.href)).size).toBe(ids.length)
    expect(new Set(ADMIN_NAV.map(navTestId)).size).toBe(ids.length)
  })

  it("keeps the test ids the E2E specs use", () => {
    for (const id of ["overview", "users", "invites", "announcements", "ai-activity", "cost-analysis", "discord", "watchlist", "queues", "rewind", "settings"]) {
      expect(ADMIN_NAV.map(navTestId)).toContain(`admin-nav-${id}`)
    }
  })

  it("folds Season, Playground and Share analytics into the one Rewind item", () => {
    const ids = ADMIN_NAV.map((item) => item.id)
    for (const folded of ["season", "playground", "share-analytics"]) expect(ids).not.toContain(folded)
    expect(ids).toContain("rewind")
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

  it("opens an item with children on its first child, and gives its children unique ids", () => {
    const sections = ADMIN_NAV.filter((item) => item.children)
    for (const item of sections) expect(item.children?.[0].href).toBe(item.href)
    const childIds = sections.flatMap((item) => item.children?.map((child) => child.id) ?? [])
    expect(new Set(childIds).size).toBe(childIds.length)
  })

  it("badges members, active invites, pending applications and failed jobs", () => {
    const counts = { users: 7, activeInvites: 3, pendingAffiliates: 2, failedJobs: 2 }
    expect(byId("users").badge?.(counts)).toEqual({ text: "7" })
    expect(byId("invites").badge?.(counts)).toEqual({ text: "3 active" })
    expect(byId("queues").badge?.(counts)).toEqual({ text: "2 failed", tone: "destructive" })
    expect(byId("invites").badge?.({ ...counts, activeInvites: 0 })).toBeNull()
    expect(byId("queues").badge?.({ ...counts, failedJobs: 0 })).toBeNull()
    expect(byId("queues").badge?.({ ...counts, failedJobs: null })).toBeNull()
    expect(byId("affiliates").badge?.(counts)).toEqual({ text: "2 pending" })
    expect(byId("affiliates").badge?.({ ...counts, pendingAffiliates: 0 })).toBeNull()
  })
})

describe("isActive", () => {
  it.each([
    ["users", "/admin/users", true],
    ["users", "/admin/users/abc", true],
    ["users", "/admin/users-archive", false],
    ["rewind", "/admin/rewind", true],
    ["rewind", "/admin/rewind/playground", true],
    ["rewind", "/admin/rewind/settings", true],
    ["rewind", "/admin/shares", true],
    ["rewind", "/admin/sharesheet", false],
    ["rewind", "/admin/users", false],
    ["invites", "/admin/invites/i1", true],
    ["watchlist", "/admin/watchlist", true],
    ["discord", "/admin/discord/settings", true],
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
    expect(titleFor("/admin/shares")).toBe("Rewind")
    expect(titleFor("/admin/rewind/playground")).toBe("Rewind")
    expect(titleFor("/admin/rewind/settings")).toBe("Rewind")
    expect(titleFor("/admin/discord/settings")).toBe("Discord")
    expect(titleFor("/admin/wrapped/w1/history/u1")).toBe("Admin")
    expect(activeItem("/admin/ai/conversation/c1")?.id).toBe("ai-activity")
  })
})

describe("Discord", () => {
  it("is one item that opens on Activity and has a Settings tab", () => {
    expect(byId("discord")).toMatchObject({ label: "Discord", href: "/admin/discord", match: "prefix", mobile: "more" })
    expect(byId("discord").children).toEqual([
      { id: "discord-activity", label: "Activity", href: "/admin/discord" },
      { id: "discord-settings", label: "Settings", href: "/admin/discord/settings" },
    ])
  })
})

describe("children and also", () => {
  const fixture: AdminNavItem = {
    id: "x",
    label: "X",
    href: "/admin/x" as Route,
    icon: icons.users,
    group: null,
    match: "prefix",
    mobile: "more",
    also: ["/admin/y" as Route],
    children: [
      { id: "x-a", label: "A", href: "/admin/x" as Route, permission: "users:read" },
      { id: "x-b", label: "B", href: "/admin/y" as Route },
    ],
  }
  const support = { isAdmin: false, role: "support" }

  it("lights on an also prefix", () => {
    expect(isActive(fixture, "/admin/y/123")).toBe(true)
  })

  it("lights on an also path itself, not on a longer name, and for an exact item too", () => {
    expect(isActive(fixture, "/admin/y")).toBe(true)
    expect(isActive(fixture, "/admin/yearly")).toBe(false)
    expect(isActive({ ...fixture, match: "exact" }, "/admin/y/123")).toBe(true)
    expect(isActive({ ...fixture, match: "exact" }, "/admin/x/123")).toBe(false)
  })

  it("activeItem is the parent for a sibling path", () => {
    expect(activeItem("/admin/y/123", [fixture])?.id).toBe("x")
  })

  it("childrenOf filters by permission for a role and keeps all for an admin", () => {
    expect(childrenOf("x", support, [fixture]).map((c) => c.id)).toEqual(["x-a"])
    expect(childrenOf("x", { isAdmin: true }, [fixture]).map((c) => c.id)).toEqual(["x-a", "x-b"])
    expect(childrenOf("nope", { isAdmin: true }, [fixture])).toEqual([])
  })

  it("childrenOf is empty for an item without children and for a subject with no role", () => {
    const plain: AdminNavItem = { ...fixture, id: "plain", children: undefined }
    expect(childrenOf("plain", { isAdmin: true }, [plain])).toEqual([])
    expect(childrenOf("x", { isAdmin: false, role: null }, [fixture])).toEqual([])
  })

  it("navFor shows an item whose child the role may open, at that child's href", () => {
    const only: AdminNavItem = {
      ...fixture,
      children: [
        { id: "x-b", label: "B", href: "/admin/y" as Route },
        { id: "x-a", label: "A", href: "/admin/x" as Route, permission: "users:read" },
      ],
    }
    expect(navFor(support, [only]).map((i) => i.href)).toEqual(["/admin/x"])
  })

  it("navFor opens a role on its first permitted child, and leaves an admin and the config as they are", () => {
    const opensElsewhere: AdminNavItem = {
      ...fixture,
      children: [
        { id: "x-a", label: "A", href: "/admin/x" as Route },
        { id: "x-b", label: "B", href: "/admin/y" as Route, permission: "users:read" },
      ],
    }
    expect(navFor(support, [opensElsewhere]).map((i) => i.href)).toEqual(["/admin/y"])
    expect(navFor({ isAdmin: true }, [opensElsewhere]).map((i) => i.href)).toEqual(["/admin/x"])
    expect(opensElsewhere.href).toBe("/admin/x")
  })

  it("navFor keeps the item's own href when its permission shows it but no child opens, and hides it without either", () => {
    const ownPermission: AdminNavItem = {
      ...fixture,
      permission: "users:read",
      children: [{ id: "x-b", label: "B", href: "/admin/y" as Route }],
    }
    const adminOnly: AdminNavItem = { ...fixture, children: [{ id: "x-b", label: "B", href: "/admin/y" as Route }] }
    expect(navFor(support, [ownPermission]).map((i) => i.href)).toEqual(["/admin/x"])
    expect(navFor(support, [adminOnly])).toEqual([])
    expect(navFor({ isAdmin: false, role: null }, [fixture, ownPermission])).toEqual([])
  })
})

describe("Rewind", () => {
  it("is one item with the Season, Playground, Shares and Settings tabs, lit on /admin/shares too", () => {
    expect(byId("rewind")).toMatchObject({
      label: "Rewind",
      href: "/admin/rewind",
      group: "Rewind",
      match: "prefix",
      mobile: "tab",
      also: ["/admin/shares"],
    })
    expect(byId("rewind").children).toEqual([
      { id: "season", label: "Season", href: "/admin/rewind" },
      { id: "playground", label: "Playground", href: "/admin/rewind/playground" },
      { id: "shares", label: "Shares", href: "/admin/shares" },
      { id: "rewind-settings", label: "Settings", href: "/admin/rewind/settings" },
    ])
  })

  it("offers every tab to an admin and none to a role, and is lit on each tab's page", () => {
    expect(childrenOf("rewind", { isAdmin: true }).map((tab) => tab.id)).toEqual(["season", "playground", "shares", "rewind-settings"])
    expect(childrenOf("rewind", { isAdmin: false, role: "support" })).toEqual([])
    expect(navFor({ isAdmin: false, role: "support" }).map((item) => item.id)).not.toContain("rewind")
    for (const tab of byId("rewind").children ?? []) expect(activeItem(tab.href)?.id).toBe("rewind")
  })
})

describe("mobileTabs", () => {
  it("shows Overview, Users, Rewind, Settings and More, with the Rewind tab on Season (P10.8)", () => {
    const tabs = mobileTabs()
    expect(tabs.map((tab) => tab.id)).toEqual(["overview", "users", "rewind", "settings", "more"])
    expect(tabs.map((tab) => tab.label)).toEqual(["Overview", "Users", "Rewind", "Settings", "More"])
    const rewind = tabs.find((tab) => tab.id === "rewind") as MobileLinkTab
    expect(rewind.href).toBe("/admin/rewind")
    expect(rewind.covers.map((item) => item.id)).toEqual(["rewind"])
    expect(isTabActive(rewind, "/admin/rewind")).toBe(true)
    expect(isTabActive(rewind, "/admin/rewind/playground")).toBe(true)
    expect(isTabActive(rewind, "/admin/rewind/settings")).toBe(true)
    expect(isTabActive(rewind, "/admin/shares")).toBe(true)
    expect(isTabActive(rewind, "/admin/users")).toBe(false)
  })

  it("takes every other tab item in nav order, with Settings last before More", () => {
    const extra: AdminNavItem = { ...byId("users"), id: "extra", label: "Extra", href: "/admin/extra" as Route }
    const tabs = mobileTabs([...ADMIN_NAV, extra])
    expect(tabs.map((tab) => tab.id)).toEqual(["overview", "users", "rewind", "extra", "settings", "more"])
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

describe("Assistant", () => {
  it("follows Overview, ungrouped, and opens from More on a phone", () => {
    expect(ADMIN_NAV[1]).toMatchObject({
      id: "assistant",
      label: "Assistant",
      href: "/admin/assistant",
      group: null,
      mobile: "more",
      permission: "assistant:use",
    })
    expect(mobileTabs().map((tab) => tab.id)).not.toContain("assistant")
  })

  it("lights on each conversation's URL", () => {
    expect(activeItem("/admin/assistant")?.id).toBe("assistant")
    expect(titleFor("/admin/assistant")).toBe("Assistant")
  })

  it("is in a Support user's nav beside Users, and in no one's without a role", () => {
    expect(navFor({ isAdmin: false, role: "support" }).map((item) => item.id)).toEqual(["assistant", "users", "affiliates", "audit"])
    expect(navFor({ isAdmin: false, role: null })).toEqual([])
  })
})

describe("isImmersive", () => {
  it.each([
    // The admin Rewind preview keeps the nav (P7.9)
    ["/admin/users/u1/rewind/2025", false],
    ["/admin/wrapped/w1/history/l1", true],
    ["/admin/users/u1", false],
  ])("%s is %s", (pathname, expected) => {
    expect(isImmersive(pathname)).toBe(expected)
  })
})
