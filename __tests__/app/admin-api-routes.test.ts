/**
 * @jest-environment node
 */

/**
 * Admin reads load on the server and admin writes are Server Actions (BP-33,
 * P10.7), so only two admin API routes are left. The command menu's search
 * is a GET on purpose for typeahead (P10.16). The media cleanup live preview
 * is an abortable POST (TS E9): Server Actions cannot be aborted and run one
 * at a time per client, so a preview of each edit would queue behind the
 * previews of the edits before it.
 */

import fs from "node:fs"
import path from "node:path"

const ADMIN_API = path.join(process.cwd(), "app", "api", "admin")

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return /^route\.(ts|tsx|js)$/.test(entry.name) ? [path.relative(ADMIN_API, full)] : []
  })
}

describe("app/api/admin", () => {
  it("holds only the cleanup preview route and the search route", () => {
    expect(routeFiles(ADMIN_API).sort()).toEqual([path.join("cleanup", "preview", "route.ts"), path.join("search", "route.ts")])
  })
})
