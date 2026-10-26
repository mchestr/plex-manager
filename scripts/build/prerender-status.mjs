/**
 * Drops `"status": 200` from each page `next build` prerenders
 * (`.next/server/app/**\/*.meta`), so the status proxy.ts sets survives.
 *
 * With Cache Components, a page is answered from its prerendered shell (a
 * dynamic route with no prerendered params from its fallback shell), and Next
 * sets the response status from the shell's cache entry. The build writes
 * `"status": 200`, which overwrites the 404 proxy.ts rewrites with for a share
 * token that shares nothing, an invalid Rewind year or a membership page the
 * member lacks. A shell regenerated at runtime carries no status, so the bug
 * lasts from the start of a new build until something revalidates `/` (Next
 * 16.4.2 and 16.4.3, `app-page-runtime.js`, `res.statusCode =
 * cachedData.status`). Without a status the response keeps the one already on
 * it: 200 for a normal request, the proxy's 404 for a rewrite. Any other
 * status (`_not-found`'s 404) stays.
 *
 * @module scripts/build/prerender-status
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

/**
 * Removes `"status": 200` from every `.meta` under each of `appDirs`
 * (`.next/server/app` and the standalone copy). Returns the files it changed.
 *
 * @param {string[]} appDirs
 * @returns {string[]}
 */
export function stripPrerenderStatus(appDirs) {
  const changed = []
  for (const dir of appDirs.filter((dir) => existsSync(dir))) {
    const metas = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".meta"))
      .map((entry) => path.join(entry.parentPath, entry.name))
    for (const file of metas) {
      const meta = JSON.parse(readFileSync(file, "utf8"))
      if (meta.status !== 200) continue
      delete meta.status
      writeFileSync(file, JSON.stringify(meta))
      changed.push(file)
    }
  }
  return changed
}
