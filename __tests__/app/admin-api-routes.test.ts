/**
 * @jest-environment node
 */

/**
 * Admin reads load on the server and admin writes are Server Actions (BP-33,
 * P10.7), so the only admin API route left is the command menu's search, a
 * GET on purpose for typeahead (P10.16).
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
  it("holds only the search route", () => {
    expect(routeFiles(ADMIN_API)).toEqual([path.join("search", "route.ts")])
  })
})
