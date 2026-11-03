/**
 * The admin navigation config (ui-design-system 5.5 and 6.2): one list that
 * feeds the sidebar, the mobile tab bar and its More sheet, page titles
 * (`titleFor`, read by PageHeader) and later the command menu (P10.16).
 *
 * ## Groups and section tabs
 *
 * The groups are being retired in favour of section tabs: an item with
 * `children` gets a tab strip (`SectionTabs`, rendered by the layout of its
 * route group) and `also` lights it on the sibling routes those tabs open.
 *
 * ```
 * Overview, Assistant ungrouped, at the top (P10.8)
 * Community           Users, Invites, Affiliates, Announcements, Discord bot, Watchlist sync, Inactive members
 * Rewind              Rewind: Season, Playground, Shares and Settings tabs
 * Usage and cost      AI activity, Cost analysis
 * System              Audit log, Job queues, Settings
 * ```
 *
 * `typedRoutes` rejects links to routes that do not exist yet, so the step
 * that ships a route adds its item or tab: Season (P7.8, shipped), Playground
 * (P8.8, `/admin/rewind/playground`), Rewind settings (`/admin/rewind/settings`)
 * and Overview (P10.8, shipped).
 *
 * Labels are sentence case, equal the page titles (UI-21) and say Rewind,
 * never Wrapped (UI-32). Each item's test id is `admin-nav-<id>`.
 *
 * @module lib/admin/nav
 */

import type { LucideIcon } from "lucide-react"
import type { Route } from "next"

import { hasPermission, type Permission, type PermissionSubject } from "@/lib/permissions"
import { icons } from "@/lib/ui/icons"

export type AdminNavGroup = "Community" | "Rewind" | "Usage and cost" | "System"

/** The sidebar badges' numbers; `failedJobs` is `null` while Redis is down. */
export interface NavCounts {
  users: number
  activeInvites: number
  /** Affiliate applications waiting for a decision. */
  pendingAffiliates: number
  failedJobs: number | null
}

interface AdminNavBadge {
  text: string
  tone?: "destructive"
}

export interface AdminNavChild {
  id: string
  label: string
  href: Route
  /** Shows the tab to a non-admin role with this permission; without one, admins only. */
  permission?: Permission
}

export interface AdminNavItem {
  id: string
  label: string
  href: Route
  icon: LucideIcon
  /** `null` for the ungrouped items at the top, Overview and Assistant. */
  group: AdminNavGroup | null
  /** `exact` lights only on `href`; `prefix` also lights on its subpaths. */
  match: "exact" | "prefix"
  /** `tab` items sit in the mobile tab bar; the rest open from More. */
  mobile: "tab" | "more"
  badge?: (counts: NavCounts) => AdminNavBadge | null
  /** The permission that shows the item to a non-admin role; without one, only admins see it. */
  permission?: Permission
  /** Extra path prefixes that light this item, for route-group siblings such as /admin/shares under Rewind. */
  also?: readonly Route[]
  /** The item's section tabs, in order. The item's `href` is its first child's `href`. */
  children?: readonly AdminNavChild[]
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = ["Community", "Rewind", "Usage and cost", "System"]

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/admin",
    icon: icons.overview,
    group: null,
    // Exact: every admin page sits under /admin and lights its own item.
    match: "exact",
    mobile: "tab",
  },
  {
    id: "assistant",
    label: "Assistant",
    href: "/admin/assistant",
    icon: icons.assistant,
    group: null,
    match: "prefix",
    // Below `md` the top bar's assistant button opens it too
    mobile: "more",
    permission: "assistant:use",
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    icon: icons.users,
    group: "Community",
    match: "prefix",
    mobile: "tab",
    permission: "users:read",
    badge: ({ users }) => ({ text: String(users) }),
  },
  {
    id: "invites",
    label: "Invites",
    href: "/admin/invites",
    icon: icons.invites,
    group: "Community",
    match: "prefix",
    mobile: "more",
    badge: ({ activeInvites }) => (activeInvites > 0 ? { text: `${activeInvites} active` } : null),
  },
  {
    id: "affiliates",
    label: "Affiliates",
    href: "/admin/affiliates",
    icon: icons.affiliates,
    group: "Community",
    match: "prefix",
    mobile: "more",
    permission: "affiliates:read",
    badge: ({ pendingAffiliates }) => (pendingAffiliates > 0 ? { text: `${pendingAffiliates} pending` } : null),
  },
  {
    id: "announcements",
    label: "Announcements",
    href: "/admin/announcements",
    icon: icons.announcements,
    group: "Community",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "discord",
    label: "Discord bot",
    href: "/admin/discord",
    icon: icons.discordBot,
    group: "Community",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "watchlist",
    label: "Watchlist sync",
    href: "/admin/watchlist",
    icon: icons.watchlist,
    group: "Community",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "inactivity",
    label: "Inactive members",
    href: "/admin/inactivity",
    icon: icons.inactivity,
    group: "Community",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "rewind",
    label: "Rewind",
    href: "/admin/rewind",
    icon: icons.rewind,
    group: "Rewind",
    // Prefix: Playground and Settings sit below /admin/rewind; Shares sits beside it, so `also` lights it
    match: "prefix",
    also: ["/admin/shares"],
    mobile: "tab",
    children: [
      { id: "season", label: "Season", href: "/admin/rewind" },
      { id: "playground", label: "Playground", href: "/admin/rewind/playground" },
      { id: "shares", label: "Shares", href: "/admin/shares" },
      { id: "rewind-settings", label: "Settings", href: "/admin/rewind/settings" },
    ],
  },
  {
    id: "ai-activity",
    label: "AI activity",
    href: "/admin/ai",
    icon: icons.llmUsage,
    group: "Usage and cost",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "cost-analysis",
    label: "Cost analysis",
    href: "/admin/cost-analysis",
    icon: icons.cost,
    group: "Usage and cost",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "audit",
    label: "Audit log",
    href: "/admin/audit",
    icon: icons.audit,
    group: "System",
    match: "prefix",
    mobile: "more",
    permission: "audit:read",
  },
  {
    id: "queues",
    label: "Job queues",
    href: "/admin/queues",
    icon: icons.queues,
    group: "System",
    match: "prefix",
    mobile: "more",
    badge: ({ failedJobs }) => (failedJobs ? { text: `${failedJobs} failed`, tone: "destructive" } : null),
  },
  {
    id: "settings",
    label: "Settings",
    href: "/admin/settings",
    icon: icons.settings,
    group: "System",
    match: "prefix",
    mobile: "tab",
  },
]

/** `Usage and cost` reads `usage-and-cost`, for ids. */
export function groupSlug(group: AdminNavGroup): string {
  return group.toLowerCase().replaceAll(" ", "-")
}

export function navTestId(item: Pick<AdminNavItem, "id">): string {
  return `admin-nav-${item.id}`
}

/** Whether `item` is the current location, so it gets `aria-current="page"`. */
export function isActive(item: Pick<AdminNavItem, "href" | "match" | "also">, pathname: string): boolean {
  if (pathname === item.href) return true
  if (item.match === "prefix" && pathname.startsWith(`${item.href}/`)) return true
  return item.also?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false
}

/** Whether the subject may open what `permission` gates; without one, only an admin may. */
function mayOpen(subject: PermissionSubject, { permission }: Pick<AdminNavItem, "permission">): boolean {
  return permission === undefined ? subject.isAdmin : hasPermission(subject, permission)
}

/**
 * The items the subject may open: all for an admin; for a role, those whose
 * permission it holds or that have a tab it may open. Such an item opens on
 * its first permitted tab, so Members opens on Users for Support.
 */
export function navFor(subject: PermissionSubject, items: readonly AdminNavItem[] = ADMIN_NAV): readonly AdminNavItem[] {
  if (subject.isAdmin) return items
  return items.flatMap((item) => {
    const first = item.children?.find((child) => mayOpen(subject, child))
    if (!first && !mayOpen(subject, item)) return []
    return [first ? { ...item, href: first.href } : item]
  })
}

/** `item.children` the subject may open; `[]` for an item without children. */
export function childrenOf(id: string, subject: PermissionSubject, items: readonly AdminNavItem[] = ADMIN_NAV): AdminNavChild[] {
  const children = items.find((item) => item.id === id)?.children ?? []
  return children.filter((child) => mayOpen(subject, child))
}

/** The items of one group, in config order (`null` for the ungrouped top). */
export function itemsIn(group: AdminNavGroup | null, items: readonly AdminNavItem[] = ADMIN_NAV): AdminNavItem[] {
  return items.filter((item) => item.group === group)
}

export interface MobileLinkTab {
  kind: "link"
  id: string
  label: string
  href: Route
  icon: LucideIcon
  /** The items whose pages light this tab. */
  covers: readonly AdminNavItem[]
}

interface MobileMoreTab {
  kind: "more"
  id: "more"
  label: "More"
}

export type MobileTab = MobileLinkTab | MobileMoreTab

function linkTab(item: AdminNavItem): MobileLinkTab {
  return { kind: "link", id: item.id, label: item.label, href: item.href, icon: item.icon, covers: [item] }
}

/**
 * The mobile tab bar: Overview first, then every other `mobile: "tab"` item in
 * nav order (Users, Rewind), then Settings and More. A tab opens its item's
 * first child and lights on all of the item's pages, `also` included, so the
 * Rewind tab is lit on /admin/shares; the other items open from More.
 */
export function mobileTabs(items: readonly AdminNavItem[] = ADMIN_NAV): MobileTab[] {
  const byId = (id: string) => items.find((item) => item.id === id)
  const first = byId("overview")
  const tabs: MobileTab[] = []

  if (first) tabs.push(linkTab(first))
  for (const item of items) if (item.mobile === "tab" && item.id !== "settings" && item !== first) tabs.push(linkTab(item))
  const settings = byId("settings")
  if (settings) tabs.push(linkTab(settings))
  tabs.push({ kind: "more", id: "more", label: "More" })
  return tabs
}

export function isTabActive(tab: MobileLinkTab, pathname: string): boolean {
  return tab.covers.some((item) => isActive(item, pathname))
}

/** The nav item for `pathname`: the longest `href` that lights for it. @internal */
export function activeItem(pathname: string, items: readonly AdminNavItem[] = ADMIN_NAV): AdminNavItem | null {
  let best: AdminNavItem | null = null
  for (const item of items) {
    if (isActive(item, pathname) && (!best || item.href.length > best.href.length)) best = item
  }
  return best
}

/**
 * The page title for `pathname`: its nav item's label, or "Admin" off the
 * nav. PageHeader (P6.5) and the command menu (P10.16) read it.
 *
 * @internal until P6.5 merges its first caller
 */
export function titleFor(pathname: string): string {
  return activeItem(pathname)?.label ?? "Admin"
}

/**
 * Immersive routes draw their own full-screen chrome, so the shell hides its
 * sidebar and bars there: a stored generation's history.
 */
const IMMERSIVE: readonly RegExp[] = [/^\/admin\/wrapped\/[^/]+\/history\//]

export function isImmersive(pathname: string): boolean {
  return IMMERSIVE.some((pattern) => pattern.test(pathname))
}
