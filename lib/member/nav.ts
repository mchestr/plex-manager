/**
 * The member top bar's links (ui-design-system 6.1).
 *
 * `memberNav()` starts with Home and, when the member can open something
 * there, "Rewind {year}". P10.22 adds Help and Membership (Account settings
 * lives in the account menu); each step that ships a route adds its entry, because
 * `typedRoutes` rejects links to routes that do not exist yet.
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
  /** The season year, for the "Rewind {year}" label; `null` hides the item. */
  rewindYear: number | null
}

export function memberNav({ rewindYear }: MemberNavOptions): MemberNavItem[] {
  const items: MemberNavItem[] = [{ href: "/", label: "Home", match: "exact" }]
  if (rewindYear !== null) items.push({ href: "/rewind", label: `Rewind ${rewindYear}`, match: "prefix" })
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
