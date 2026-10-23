/**
 * @jest-environment node
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// P11.19 turned on Cache Components, which rejects the old route segment
// config: uncached data renders per request, and cached data says so with
// 'use cache'. None of these exports may come back under app/.

const ROOT = path.resolve(__dirname, "../..")
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const SEGMENT_CONFIG = /^export\s+const\s+(dynamic|revalidate|fetchCache|runtime|dynamicParams|experimental_ppr)\b/m

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(rel)
    return SOURCE.test(entry.name) ? [rel] : []
  })
}

describe("Cache Components route config", () => {
  it("turns cacheComponents on", () => {
    const config = readFileSync(path.join(ROOT, "next.config.js"), "utf8")
    expect(config).toMatch(/^\s*cacheComponents: true,/m)
  })

  it("leaves no dynamic, revalidate, fetchCache or runtime export in app/", () => {
    const offenders = sourceFiles("app").flatMap((file) => {
      const match = readFileSync(path.join(ROOT, file), "utf8").match(SEGMENT_CONFIG)
      return match ? [`${file}: ${match[1]}`] : []
    })
    expect(offenders).toEqual([])
  })

  it("has no force-dynamic anywhere in app/", () => {
    const offenders = sourceFiles("app").filter((file) => readFileSync(path.join(ROOT, file), "utf8").includes("force-dynamic"))
    expect(offenders).toEqual([])
  })
})
