/**
 * @jest-environment node
 *
 * P11.19: a `'use cache'` entry is shared between viewers and kept by the
 * cache handler, so no module that declares one may read a secret column
 * (`ENCRYPTED_FIELDS`) or a whole row that carries one. Secrets and anything
 * specific to the viewer are read per request instead.
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"

const ROOT = path.resolve(__dirname, "../..")
const SOURCE = /\.(?:[cm]?[jt]sx?)$/
const USE_CACHE = /^\s*["']use cache(?::\s*[\w-]+)?["']/m
/** Per-request readers of rows with secrets (`lib/data/active-service.ts`, the Plex config, the session). */
const SECRET_READERS = /\b(getActiveService|getActivePlexServerConfig|getSession|getServerSession)\s*\(/

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return ["__tests__", "generated", "node_modules"].includes(entry.name) ? [] : sourceFiles(rel)
    return SOURCE.test(entry.name) ? [rel] : []
  })
}

const delegate = (model: string) => model.charAt(0).toLowerCase() + model.slice(1)

/** The argument text of the call that opens at `start` (just after its `(`). */
function callArgs(source: string, start: number): string {
  let depth = 1
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth++
    if (source[i] === ")" && --depth === 0) return source.slice(start, i)
  }
  return source.slice(start)
}

/** Whether a read's arguments limit it to a `select`, inline or through a named constant in the module. */
function selects(source: string, args: string): boolean {
  if (/\bselect\s*:/.test(args)) return true
  const name = args.trim().match(/^([A-Za-z_$][\w$]*)$/)?.[1]
  if (!name) return false
  const definition = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\{[\\s\\S]*?\\}\\s*as const`))
  return Boolean(definition && /\bselect\s*:/.test(definition[0]))
}

function violations(file: string): string[] {
  const source = readFileSync(path.join(ROOT, file), "utf8")
  const found: string[] = []

  for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    for (const field of fields) {
      if (new RegExp(`\\b${field}\\s*:\\s*true\\b`).test(source)) found.push(`${file}: selects ${model}.${field}`)
    }
    const reads = new RegExp(`\\.${delegate(model)}\\.(findFirst|findUnique|findMany|findFirstOrThrow|findUniqueOrThrow)\\(`, "g")
    for (const match of source.matchAll(reads)) {
      const args = callArgs(source, (match.index ?? 0) + match[0].length)
      if (!selects(source, args)) found.push(`${file}: reads whole ${model} rows`)
    }
  }
  if (SECRET_READERS.test(source)) found.push(`${file}: calls a per-request secret reader`)
  return found
}

describe("'use cache' modules hold no secrets", () => {
  const cached = ["app", "lib", "actions", "components"].flatMap(sourceFiles).filter((file) => USE_CACHE.test(readFileSync(path.join(ROOT, file), "utf8")))

  it("finds the cached modules", () => {
    expect(cached).toEqual(expect.arrayContaining(["lib/settings/app-settings.ts", "lib/stripe/prices.ts"]))
  })

  it("selects no ENCRYPTED_FIELDS column and reads no whole secret-bearing row", () => {
    expect(cached.flatMap(violations)).toEqual([])
  })

  it("would catch a cached module that reads a secret", () => {
    const tokenRead = `"use cache"\nawait prisma.plexServer.findFirst({ where: { isActive: true } })\nselect: { token: true }`
    expect(new RegExp(`\\btoken\\s*:\\s*true\\b`).test(tokenRead)).toBe(true)
    expect(selects(tokenRead, "{ where: { isActive: true } }")).toBe(false)
  })
})
