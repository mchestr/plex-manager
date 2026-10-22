#!/usr/bin/env tsx
/**
 * Write the Rewind golden fixtures from their profiles (P2.10).
 *
 * Usage:
 *   npx tsx evals/rewind/generate-fixtures.ts           # write evals/rewind/fixtures/*.json
 *   npx tsx evals/rewind/generate-fixtures.ts --check   # fail on any drift, write nothing
 *   npx tsx evals/rewind/generate-fixtures.ts --december [--check]  # the same for fixtures/december/*.json (P8.5)
 *
 * Each profile's rows come from a mulberry32 seeded with its id, so a run is
 * deterministic. Every fixture is validated with `fixtureSchema` before it is
 * written. The expected values are copied from the profiles as authored: the
 * generator never computes one.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { decemberExtension, type DecemberExtension } from "./december"
import { fixtureSchema, type Fixture } from "./fixture-schema"
import { PROFILES } from "./profiles"
import { mulberry32 } from "./rows"

const FIXTURES_DIR = path.resolve("evals/rewind/fixtures")
const MAX_BYTES = 2 * 1024 * 1024

/** FNV-1a: a stable seed from a profile id. */
function seedOf(id: string): number {
  let hash = 0x811c9dc5
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return hash
}

/** JSON with two-space indents, except that every row sits on one line. */
function serialise(fixture: Fixture): string {
  const ROWS = ["history", "lifetimeBefore2026", "metadata", "library"] as const
  const placeholder = (key: string) => `"__${key}__"`
  const skeleton = JSON.stringify(
    { ...fixture, ...Object.fromEntries(ROWS.map((key) => [key, `__${key}__`])) },
    null,
    2
  )
  return (
    ROWS.reduce((text, key) => {
      const rows = fixture[key]
      const body = !rows ? "null" : rows.length === 0 ? "[]" : `[\n${rows.map((row) => `    ${JSON.stringify(row)}`).join(",\n")}\n  ]`
      return text.replace(placeholder(key), () => body)
    }, skeleton) + "\n"
  )
}

/** A December extension: its fixture id, then one history row per line. */
function serialiseDecember(december: DecemberExtension): string {
  const rows = december.history.map((row) => `    ${JSON.stringify(row)}`).join(",\n")
  return `{\n  "fixture": ${JSON.stringify(december.fixture)},\n  "history": [\n${rows}\n  ]\n}\n`
}

function build(december: boolean): Map<string, string> {
  const files = new Map<string, string>()
  for (const { build: rows, ...profile } of PROFILES) {
    const built = rows(mulberry32(seedOf(profile.id)))
    const fixture = fixtureSchema.parse({ ...profile, ...built, library: built.library ?? null })
    if (files.has(`${fixture.id}.json`)) throw new Error(`Duplicate fixture id ${fixture.id}`)
    files.set(`${fixture.id}.json`, december ? serialiseDecember(decemberExtension(fixture)) : serialise(fixture))
  }
  return files
}

function main() {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false }, december: { type: "boolean", default: false } } })
  const DIR = values.december ? path.join(FIXTURES_DIR, "december") : FIXTURES_DIR
  if (!values.check && !existsSync(DIR)) mkdirSync(DIR)
  const files = build(values.december)
  const existing = existsSync(DIR) ? readdirSync(DIR).filter((name) => name.endsWith(".json")) : []
  const drift: string[] = []

  for (const [name, text] of files) {
    if (Buffer.byteLength(text) > MAX_BYTES) drift.push(`${name} is over 2 MB`)
    const file = path.join(DIR, name)
    const current = existsSync(file) ? readFileSync(file, "utf8") : null
    if (current === text) continue
    if (values.check) drift.push(`${name} ${current === null ? "is missing" : "differs from its profile"}`)
    else writeFileSync(file, text)
  }
  for (const name of existing.filter((name) => !files.has(name))) {
    if (values.check) drift.push(`${name} has no profile`)
    else unlinkSync(path.join(DIR, name))
  }

  if (drift.length > 0) {
    console.error(`Fixture drift:\n  ${drift.join("\n  ")}\nRun: npx tsx evals/rewind/generate-fixtures.ts`)
    process.exit(1)
  }
  const largest = Math.max(...[...files.keys()].map((name) => statSync(path.join(DIR, name)).size))
  console.log(`${files.size} fixtures ${values.check ? "match their profiles" : "written"}; largest ${(largest / 1024).toFixed(0)} KB`)
}

main()
