/**
 * @jest-environment node
 */

/**
 * Every tab of a section has a `loading.tsx` beside its page. The tabs of one
 * section share its layout, so `app/admin/loading.tsx` does not suspend again
 * on a tab switch: a tab without its own boundary shows nothing until the next
 * page is ready, or the skeleton of a sibling tab above it.
 */

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { ADMIN_NAV } from "@/lib/admin/nav"

const ADMIN_DIR = join(__dirname, "..")

/** The folder under `app/admin` whose page serves `segments`; a route group is a folder, not a URL segment. */
function pageFolder(dir: string, segments: readonly string[]): string | null {
  if (segments.length === 0 && existsSync(join(dir, "page.tsx"))) return dir
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const rest = entry.name.startsWith("(") ? segments : entry.name === segments[0] ? segments.slice(1) : null
    const found = rest && pageFolder(join(dir, entry.name), rest)
    if (found) return found
  }
  return null
}

const TABS = ADMIN_NAV.flatMap((item) => (item.children ?? []).map((tab) => [`${item.id}/${tab.id}`, tab.href] as const))

it("checks the tabs of every section", () => {
  expect(TABS.length).toBeGreaterThanOrEqual(ADMIN_NAV.filter((item) => item.children).length * 2)
})

it.each(TABS)("%s has a loading.tsx beside its page", (_tab, href) => {
  const folder = pageFolder(ADMIN_DIR, href.replace(/^\/admin\/?/, "").split("/").filter(Boolean))

  expect(folder).not.toBeNull()
  expect(readdirSync(folder as string)).toContain("loading.tsx")
  // Next refuses a loading file without a component as its default export
  expect(typeof require(join(folder as string, "loading.tsx")).default).toBe("function")
})
