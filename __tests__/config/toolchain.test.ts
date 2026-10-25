/**
 * @jest-environment node
 *
 * The installed TypeScript and ESLint match their exact pins in package.json
 * (P11.23). `typescript` is the TypeScript 6 compatibility package, kept for
 * the tools that load the compiler API (typescript-eslint, next build, the
 * design-system check, the codemods); `@typescript/native` is TypeScript 7,
 * whose `tsc` runs `npm run typecheck`.
 */

import fs from "node:fs"
import path from "node:path"

import ts from "typescript"

const ROOT = path.resolve(__dirname, "../..")

interface Manifest {
  name: string
  version: string
  bin?: Record<string, string>
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8")) as Manifest
const pkg = readJson(path.join(ROOT, "package.json"))
const installed = (name: string) => readJson(path.join(ROOT, "node_modules", name, "package.json"))

/** "npm:typescript@7.0.2" -> { name: "typescript", version: "7.0.2" }; "10.13.0" -> { version: "10.13.0" }. */
function parsePin(spec: string): { name?: string; version: string } {
  const alias = /^npm:(.+)@(\d[^@]*)$/.exec(spec)
  return alias ? { name: alias[1], version: alias[2] } : { version: spec }
}

const major = (version: string) => Number(version.split(".")[0])
const exact = /^\d+\.\d+\.\d+$/

describe("toolchain pins", () => {
  const dev = pkg.devDependencies ?? {}

  it.each([
    ["@typescript/native", "typescript", 7],
    ["typescript", "@typescript/typescript6", 6],
  ])("%s is %s %i, pinned exactly", (dependency, packageName, expectedMajor) => {
    const pin = parsePin(dev[dependency])
    expect(pin.name).toBe(packageName)
    expect(pin.version).toMatch(exact)
    expect(major(pin.version)).toBe(expectedMajor)

    const manifest = installed(dependency)
    expect(manifest.name).toBe(packageName)
    expect(manifest.version).toBe(pin.version)
  })

  it.each([
    ["eslint", 10],
    ["@eslint/js", 10],
  ])("%s %i is installed at its exact pin", (dependency, expectedMajor) => {
    const pin = parsePin(dev[dependency])
    expect(pin.version).toMatch(exact)
    expect(major(pin.version)).toBe(expectedMajor)
    expect(installed(dependency).version).toBe(pin.version)
  })

  it("type-checks with the TypeScript 7 tsc", () => {
    expect(installed("@typescript/native").bin).toHaveProperty("tsc")
    expect(installed("typescript").bin).not.toHaveProperty("tsc")
    expect(pkg.scripts?.typecheck).toMatch(/tsc --noEmit -p tsconfig\.json && tsc --noEmit -p tsconfig\.test\.json$/)
  })

  it("loads the compiler API from TypeScript 6", () => {
    expect(major(ts.version)).toBe(6)
    expect(typeof ts.createProgram).toBe("function")
  })
})
