/**
 * The admin navigation config (ui-design-system 5.5 and 6.2): one list that
 * feeds the sidebar, the mobile tab bar and its More sheet, page titles
 * (`titleFor`, read by PageHeader) and later the command menu (P10.16).
 *
 * ## Groups
 *
 * ```
 * Overview            hidden until P10.8 ships the page
 * Community           Users, Invites, Announcements, Discord bot
 * Rewind              Season, Playground, Gallery, Prompts, Share analytics
 * Usage and cost      LLM usage, Cost analysis
 * System              Job queues, Settings
 * ```
 *
 * `typedRoutes` rejects links to routes that do not exist yet, so the step
 * that ships a route adds its item: Season (P7.8, shipped), Gallery (P7.11,
 * shipped), Playground (P8.8, `/admin/rewind/playground`), Evals (P11.30)
 * and Overview (P10.8).
 *
 * Labels are sentence case, equal the page titles (UI-21) and say Rewind,
 * never Wrapped (UI-32). Each item's test id is `admin-nav-<id>`.
 *
 * @module lib/admin/nav
 */

import type { LucideIcon } from "lucide-react"
import type { Route } from "next"

import { icons } from "@/lib/ui/icons"

export type AdminNavGroup = "Community" | "Rewind" | "Usage and cost" | "System"

/** The sidebar badges' numbers; `failedJobs` is `null` while Redis is down. */
export interface NavCounts {
  users: number
  activeInvites: number
  failedJobs: number | null
}

interface AdminNavBadge {
  text: string
  tone?: "destructive"
}

export interface AdminNavItem {
  id: string
  label: string
  href: Route
  icon: LucideIcon
  /** `null` for the ungrouped Overview at the top. */
  group: AdminNavGroup | null
  /** `exact` lights only on `href`; `prefix` also lights on its subpaths. */
  match: "exact" | "prefix"
  /** `tab` items sit in the mobile tab bar; the rest open from More. */
  mobile: "tab" | "more"
  badge?: (counts: NavCounts) => AdminNavBadge | null
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = ["Community", "Rewind", "Usage and cost", "System"]

export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    icon: icons.users,
    group: "Community",
    match: "prefix",
    mobile: "tab",
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
    id: "season",
    label: "Season",
    href: "/admin/rewind",
    icon: icons.rewind,
    group: "Rewind",
    // Exact: the Rewind pages below it (Playground, Gallery) light their own items.
    match: "exact",
    mobile: "more",
  },
  {
    id: "playground",
    label: "Playground",
    href: "/admin/rewind/playground",
    icon: icons.playground,
    group: "Rewind",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "gallery",
    label: "Gallery",
    href: "/admin/rewind/gallery",
    icon: icons.gallery,
    group: "Rewind",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "prompts",
    label: "Prompts",
    href: "/admin/prompts",
    icon: icons.prompts,
    group: "Rewind",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "share-analytics",
    label: "Share analytics",
    href: "/admin/shares",
    icon: icons.shares,
    group: "Rewind",
    match: "prefix",
    mobile: "more",
  },
  {
    id: "llm-usage",
    label: "LLM usage",
    href: "/admin/llm-usage",
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
export function isActive(item: Pick<AdminNavItem, "href" | "match">, pathname: string): boolean {
  if (pathname === item.href) return true
  return item.match === "prefix" && pathname.startsWith(`${item.href}/`)
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
 * The mobile tab bar: Overview, Users, Rewind, Settings and More. Invites
 * stands in for Overview until P10.8 ships it. The Rewind tab opens Season,
 * or Prompts until Season ships, and lights on every Rewind page.
 */
export function mobileTabs(items: readonly AdminNavItem[] = ADMIN_NAV): MobileTab[] {
  const byId = (id: string) => items.find((item) => item.id === id)
  const first = byId("overview") ?? byId("invites")
  const rewindItems = itemsIn("Rewind", items)
  const rewindTarget = byId("season") ?? byId("prompts")
  const tabs: MobileTab[] = []

  if (first) tabs.push(linkTab(first))
  for (const item of items) if (item.mobile === "tab" && item.id !== "settings" && item !== first) tabs.push(linkTab(item))
  if (rewindTarget) {
    tabs.push({ kind: "link", id: "rewind", label: "Rewind", href: rewindTarget.href, icon: icons.rewind, covers: rewindItems })
  }
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
 * sidebar, bars and the assistant there: a stored generation's history.
 */
const IMMERSIVE: readonly RegExp[] = [/^\/admin\/wrapped\/[^/]+\/history\//]

/**
 * Routes that hide only the assistant: the immersive ones, the admin Rewind
 * preview (P7.9), which keeps the nav around its framed stage, and the
 * playground, whose story preview opens in a Dialog (P8.8).
 */
const ASSISTANT_HIDDEN: readonly RegExp[] = [...IMMERSIVE, /^\/admin\/users\/[^/]+\/rewind(?:\/|$)/, /^\/admin\/rewind\/playground(?:\/|$)/]

export function isImmersive(pathname: string): boolean {
  return IMMERSIVE.some((pattern) => pattern.test(pathname))
}

export function isAssistantHidden(pathname: string): boolean {
  return ASSISTANT_HIDDEN.some((pattern) => pattern.test(pathname))
}
