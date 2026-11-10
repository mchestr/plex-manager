/**
 * The admin navigation config (ui-design-system 5.5 and 6.2): one list that
 * feeds the sidebar, the mobile tab bar and its More sheet, page titles
 * (`titleFor`, read by PageHeader) and the command menu, which lists each item and its tabs.
 *
 * ## One flat list and its section tabs
 *
 * The nav is one list, with no groups: the sidebar and the More sheet show
 * every item in this order. An item with `children` gets a tab strip
 * (`SectionTabs`, rendered by the layout of its route group, which is
 * `sectionLayout(id)`) and `also` lights it on the sibling routes those tabs
 * open.
 *
 * ```
 * Overview
 * Assistant
 * Members         Users, Invites, Affiliates
 * Announcements
 * Rewind          Season, Playground, Shares, Settings
 * Discord         Activity, Settings
 * AI              Activity, Cost, Settings
 * Automations     Watchlist sync, Inactive members, Request limits, Queues
 * Audit log
 * Settings
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

/** The sidebar badges' numbers; `failedJobs` is `null` while Redis is down. */
export interface NavCounts {
  users: number
  /** Affiliate applications waiting for a decision. */
  pendingAffiliates: number
  failedJobs: number | null
  /** Problem reports with the server admin. */
  reportsToReview: number
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
  /** `exact` lights only on `href`; `prefix` also lights on its subpaths. */
  match: "exact" | "prefix"
  /** `tab` items sit in the mobile tab bar, up to its four link tabs; the rest open from More. */
  mobile: "tab" | "more"
  badge?: (counts: NavCounts) => AdminNavBadge | null
  /** The permission that shows the item to a non-admin role; without one, only admins see it. */
  permission?: Permission
  /** Extra path prefixes that light this item, for route-group siblings such as /admin/shares under Rewind. */
  also?: readonly Route[]
  /** The item's section tabs, in order. The item's `href` is its first child's `href`. */
  children?: readonly AdminNavChild[]
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/admin",
    icon: icons.overview,
    // Exact: every admin page sits under /admin and lights its own item.
    match: "exact",
    mobile: "tab",
  },
  {
    id: "assistant",
    label: "Assistant",
    href: "/admin/assistant",
    icon: icons.assistant,
    match: "prefix",
    // Below `md` the top bar's assistant button opens it too
    mobile: "more",
    permission: "assistant:use",
  },
  {
    id: "members",
    label: "Members",
    href: "/admin/users",
    icon: icons.users,
    // Invites and Affiliates sit beside /admin/users, not below it, so `also` lights it on their paths
    match: "prefix",
    also: ["/admin/invites", "/admin/affiliates"],
    mobile: "tab",
    permission: "users:read",
    // Applications waiting for a decision outrank the member count
    badge: ({ users, pendingAffiliates }) => (pendingAffiliates > 0 ? { text: `${pendingAffiliates} to review` } : { text: String(users) }),
    // Invites has no permission, so only an admin gets its tab
    children: [
      { id: "users", label: "Users", href: "/admin/users", permission: "users:read" },
      { id: "invites", label: "Invites", href: "/admin/invites" },
      { id: "affiliates", label: "Affiliates", href: "/admin/affiliates", permission: "affiliates:read" },
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    href: "/admin/announcements",
    icon: icons.announcements,
    match: "prefix",
    mobile: "more",
  },
  {
    id: "rewind",
    label: "Rewind",
    href: "/admin/rewind",
    icon: icons.rewind,
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
    id: "discord",
    label: "Discord",
    href: "/admin/discord",
    icon: icons.discordBot,
    match: "prefix",
    mobile: "more",
    children: [
      { id: "discord-activity", label: "Activity", href: "/admin/discord" },
      { id: "discord-settings", label: "Settings", href: "/admin/discord/settings" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    href: "/admin/ai",
    icon: icons.llmUsage,
    match: "prefix",
    // Cost sits beside Activity, not below it, so its path is not under /admin/ai
    also: ["/admin/cost-analysis"],
    mobile: "more",
    children: [
      { id: "ai-activity", label: "Activity", href: "/admin/ai" },
      { id: "ai-cost", label: "Cost", href: "/admin/cost-analysis" },
      { id: "ai-settings", label: "Settings", href: "/admin/ai/settings" },
    ],
  },
  {
    id: "automations",
    label: "Automations",
    href: "/admin/problem-reports",
    icon: icons.automations,
    // Its other tabs sit beside /admin/problem-reports, not below it, so `also` lights it on their paths
    match: "prefix",
    also: ["/admin/watchlist", "/admin/inactivity", "/admin/request-limits", "/admin/queues"],
    // The tab bar follows nav order, so Automations sits after Rewind
    mobile: "tab",
    // Failed jobs keep priority over the reports to review
    badge: ({ failedJobs, reportsToReview }) =>
      failedJobs ? { text: `${failedJobs} failed`, tone: "destructive" } : reportsToReview > 0 ? { text: `${reportsToReview} to review` } : null,
    children: [
      { id: "problem-reports", label: "Problem reports", href: "/admin/problem-reports" },
      { id: "watchlist", label: "Watchlist sync", href: "/admin/watchlist" },
      { id: "inactivity", label: "Inactive members", href: "/admin/inactivity" },
      { id: "request-limits", label: "Request limits", href: "/admin/request-limits" },
      { id: "queues", label: "Queues", href: "/admin/queues" },
    ],
  },
  {
    id: "audit",
    label: "Audit log",
    href: "/admin/audit",
    icon: icons.audit,
    match: "prefix",
    mobile: "more",
    permission: "audit:read",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/admin/settings",
    icon: icons.settings,
    match: "prefix",
    mobile: "more",
  },
]

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

/** The tab bar holds this many link tabs, Overview included, and More takes the last place. */
const MAX_LINK_TABS = 4

/**
 * The mobile tab bar: Overview first, then every other `mobile: "tab"` item in
 * nav order (Members, Rewind, Automations), four link tabs at most, then More. A
 * tab opens its item's first child and lights on all of the item's pages,
 * `also` included, so the Rewind tab is lit on /admin/shares. Every other
 * item, and any tab item past the cap, opens from More only.
 */
export function mobileTabs(items: readonly AdminNavItem[] = ADMIN_NAV): MobileTab[] {
  const overview = items.find((item) => item.id === "overview")
  const others = items.filter((item) => item.mobile === "tab" && item !== overview)
  const links = (overview ? [overview, ...others] : others).slice(0, MAX_LINK_TABS)
  return [...links.map(linkTab), { kind: "more", id: "more", label: "More" }]
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
