/**
 * @jest-environment node
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// P11.29 deleted the v2 viewer (components/wrapped), its chart.js charts and
// the temporary cinematic colour aliases. Nothing may bring them back.

const ROOT = path.resolve(__dirname, "../..")
const SOURCE = /\.(?:[cm]?[jt]sx?)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "generated" || entry.name === "node_modules" ? [] : sourceFiles(rel)
    return SOURCE.test(entry.name) ? [rel] : []
  })
}

describe("the v2 viewer stays deleted", () => {
  it("has no components/wrapped folder", () => {
    expect(existsSync(path.join(ROOT, "components/wrapped"))).toBe(false)
  })

  it("is imported by no file under app, components or lib", () => {
    const importers = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((file) => /components\/wrapped\b/.test(readFileSync(path.join(ROOT, file), "utf8")))
    expect(importers).toEqual([])
  })

  it("leaves no cinematic colour alias in app/globals.css", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8")
    expect(css).not.toMatch(/--color-(?:gold|gold-bright|ivory|taupe|stage|stage-panel)\s*:/)
    expect(css).not.toMatch(/cinematic aliases/)
  })
})
