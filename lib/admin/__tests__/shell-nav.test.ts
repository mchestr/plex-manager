/**
 * @jest-environment node
 */

/**
 * What the admin shell sends for an item with tabs (`getAdminShellData`): the
 * href `navFor` resolved for the user and the ids of the tabs the user may
 * open. The nav is a fixed list here, shaped like a folded Members item whose
 * first tab only an admin may open, so the cases do not move with `ADMIN_NAV`.
 */

import type * as NavModule from "@/lib/admin/nav"
import { getAdminShellData } from "@/lib/admin/shell"
import type { PermissionSubject } from "@/lib/permissions"
import type * as IconsModule from "@/lib/ui/icons"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/admin/nav-counts", () => ({
  getAdminNavCounts: jest.fn().mockResolvedValue({ users: 7, pendingAffiliates: 2, failedJobs: 0, cleanupReview: 6 }),
}))
jest.mock("@/lib/admin/nav", () => {
  const actual = jest.requireActual<typeof NavModule>("@/lib/admin/nav")
  const { icons } = jest.requireActual<typeof IconsModule>("@/lib/ui/icons")
  const nav: readonly NavModule.AdminNavItem[] = [
    {
      id: "members",
      label: "Members",
      // Opens on its first tab, which only an admin may open
      href: "/admin/invites",
      icon: icons.users,
      match: "prefix",
      mobile: "tab",
      children: [
        { id: "invites", label: "Invites", href: "/admin/invites" },
        { id: "users", label: "Users", href: "/admin/users", permission: "users:read" },
        { id: "affiliates", label: "Affiliates", href: "/admin/affiliates", permission: "affiliates:read" },
      ],
    },
    {
      id: "audit",
      label: "Audit log",
      href: "/admin/audit",
      icon: icons.audit,
      match: "prefix",
      mobile: "more",
      // Its own permission shows the item, but its one tab is for admins
      permission: "audit:read",
      children: [{ id: "audit-events", label: "Events", href: "/admin/audit" }],
    },
    {
      id: "automations",
      label: "Automations",
      href: "/admin/watchlist",
      icon: icons.automations,
      match: "prefix",
      mobile: "tab",
      children: [{ id: "watchlist", label: "Watchlist sync", href: "/admin/watchlist" }],
    },
  ]
  return {
    ...actual,
    navFor: (subject: PermissionSubject) => actual.navFor(subject, nav),
    childrenOf: (id: string, subject: PermissionSubject) => actual.childrenOf(id, subject, nav),
  }
})

const admin = { id: "admin-1", name: "Dana Whitfield", isAdmin: true }
const support = { id: "support-1", name: "Sam Rivera", isAdmin: false, role: "support" }
const member = { id: "member-1", name: "Ada", isAdmin: false, role: null }

it("sends an admin every item at its own href, with every tab", async () => {
  expect((await getAdminShellData(admin)).nav).toEqual([
    { id: "members", href: "/admin/invites", childIds: ["invites", "users", "affiliates"] },
    { id: "audit", href: "/admin/audit", childIds: ["audit-events"] },
    { id: "automations", href: "/admin/watchlist", childIds: ["watchlist"] },
  ])
})

it("opens a role's folded item on its first permitted tab, and sends only the tabs the role may open", async () => {
  expect((await getAdminShellData(support)).nav).toEqual([
    // Invites is for admins, so the item opens on Users; Automations is for admins, so it is not sent at all
    { id: "members", href: "/admin/users", childIds: ["users", "affiliates"] },
    // No tab opens for a role, so the item keeps its own href and has no tabs
    { id: "audit", href: "/admin/audit", childIds: [] },
  ])
})

it("sends a user with no role nothing", async () => {
  expect((await getAdminShellData(member)).nav).toEqual([])
})
