/**
 * @jest-environment node
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { envSchema } from "@/lib/env"

// Every variable the code reads is described in lib/env.ts and example.env
// (GAP-18), so the environment reference never falls behind the code.

const ROOT = path.resolve(__dirname, "../..")
const SCANNED = ["app", "actions", "lib", "components", "scripts", "proxy.ts", "instrumentation.ts"]
const PLATFORM = new Set(["NODE_ENV", "NEXT_RUNTIME", "NEXT_PHASE", "HOSTNAME", "PORT"])
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/
const SKIPPED_DIRS = new Set(["__tests__", "generated", "node_modules"])
const ENV_READ = /process\.env(?:\.([A-Z_][A-Z0-9_]*)|\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\])/g

function sourceFiles(entry: string): string[] {
  if (!statSync(entry).isDirectory()) return SOURCE.test(entry) ? [entry] : []
  return readdirSync(entry).flatMap((name) =>
    SKIPPED_DIRS.has(name) || /\.test\.[jt]sx?$/.test(name) ? [] : sourceFiles(path.join(entry, name))
  )
}

function readVariables(): Set<string> {
  const names = new Set<string>()
  for (const file of SCANNED.flatMap((entry) => sourceFiles(path.join(ROOT, entry)))) {
    for (const match of readFileSync(file, "utf8").matchAll(ENV_READ)) {
      names.add(match[1] ?? match[2])
    }
  }
  return names
}

const exampleEnv = readFileSync(path.join(ROOT, "example.env"), "utf8")
const inExampleEnv = (name: string) => new RegExp(`\\b${name}=`).test(exampleEnv)

describe("environment coverage", () => {
  const read = readVariables()

  it("finds the variables the code reads", () => {
    expect(read).toContain("DATABASE_URL")
    expect(read).toContain("REDIS_URL")
  })

  it("describes every variable in envSchema, unless it is a platform or DEV_ variable", () => {
    const undescribed = [...read].filter(
      (name) => !(name in envSchema.shape) && !PLATFORM.has(name) && !name.startsWith("DEV_")
    )
    expect(undescribed).toEqual([])
  })

  it("lists every variable the code reads in example.env", () => {
    expect([...read].filter((name) => !PLATFORM.has(name) && !inExampleEnv(name))).toEqual([])
  })

  it("lists every envSchema variable in example.env", () => {
    expect(Object.keys(envSchema.shape).filter((name) => !inExampleEnv(name))).toEqual([])
  })

  it("gives every envSchema variable a description", () => {
    const shape: Record<string, { description?: string }> = envSchema.shape
    expect(Object.keys(shape).filter((name) => !shape[name].description)).toEqual([])
  })
})
