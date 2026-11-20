/**
 * The member top bar's links (ui-design-system 6.1).
 *
 * `memberNav()` starts with Home, then "Leaving soon" while the member sees
 * media cleanup's Leaving soon (TS 13.1), and, when the member can open
 * something there, "Rewind {year}", then Invites and Membership when the
 * member has those pages, and Help always (Account settings lives in the
 * account menu). Each step that
 * ships a route adds its entry, because `typedRoutes` rejects links to routes
 * that do not exist yet.
 *
 * @module lib/member/nav
 */

import type { Route } from "next"

export interface MemberNavItem {
  href: Route
  label: string
  /** `exact` lights only on `href`; `prefix` also lights on its subpaths. Default `exact`. */
  match?: "exact" | "prefix"
}

interface MemberNavOptions {
  /** `memberSeesLeavingSoon()` gave `true` (TS 12.3 item 5): a `false` or a late plex.tv answer hides the item. */
  leavingSoon: boolean
  /** The season year, for the "Rewind {year}" label; `null` hides the item. */
  rewindYear: number | null
  /** The affiliate switch is on and the member has a Plex id, so `/invites` exists. */
  invites: boolean
  /** Stripe is on or the member has a subscription row, so `/membership` exists. */
  membership: boolean
}

export function memberNav({ leavingSoon, rewindYear, invites, membership }: MemberNavOptions): MemberNavItem[] {
  const items: MemberNavItem[] = [{ href: "/", label: "Home", match: "exact" }]
  if (leavingSoon) items.push({ href: "/leaving-soon", label: "Leaving soon", match: "exact" })
  if (rewindYear !== null) items.push({ href: "/rewind", label: `Rewind ${rewindYear}`, match: "prefix" })
  if (invites) items.push({ href: "/invites", label: "Invites", match: "exact" })
  if (membership) items.push({ href: "/membership", label: "Membership", match: "exact" })
  items.push({ href: "/help", label: "Help", match: "exact" })
  return items
}

/** Whether `item` is the current location, so it gets `aria-current="page"`. */
export function isNavActive(item: MemberNavItem, pathname: string): boolean {
  if (pathname === item.href) return true
  return item.match === "prefix" && pathname.startsWith(`${item.href}/`)
}

/**
 * Routes that draw their own full-screen chrome, so the shell shows neither
 * its top bar nor the notice: every Rewind page (the story, the article and
 * the status panels carry their own Close, Rewind FR-1).
 */
const IMMERSIVE = [/^\/rewind(?:\/|$)/]

export function isImmersiveRoute(pathname: string): boolean {
  return IMMERSIVE.some((pattern) => pattern.test(pathname))
}
