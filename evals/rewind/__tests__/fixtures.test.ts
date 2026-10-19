/**
 * @jest-environment node
 */

/**
 * The golden fixtures themselves (P2.10): exactly twenty, each valid, ids
 * unique and matching their file names, every row passing the real source
 * schemas, everything synthetic, and the shared title list intact.
 */

import { statSync } from "node:fs"
import path from "node:path"

import { overseerrRequestSchema, tautulliHistoryRowSchema } from "@/lib/wrapped/sources/schemas"

import titles from "../data/titles-200.json"
import { fixtureSchema } from "../fixture-schema"
import { FIXTURE_DIR, fixtureFiles, loadFixtures, readFixtureJson } from "./load-fixtures"

const PROFILES = [
  "heavy", "median", "light", "postcard", "extreme", "seven-minutes",
  "zero-films", "zero-series", "single-title", "night-owl", "weekend-binger", "rewatcher", "explorer", "credits-roller", "premiere-chaser",
  "no-overseerr", "solo-server",
  "long-and-email-name", "long-and-non-latin-titles", "hostile-titles",
]

describe("Rewind golden fixtures", () => {
  const files = fixtureFiles()
  const fixtures = loadFixtures()

  it("are exactly the twenty profiles of design 8.6", () => {
    expect(files).toHaveLength(20)
    expect(files.map((name) => name.replace(/\.json$/, "")).sort()).toEqual([...PROFILES].sort())
  })

  it.each(files)("%s parses, and its id matches its file name", (name) => {
    const parsed = fixtureSchema.safeParse(readFixtureJson(name))
    expect(parsed.success).toBe(true)
    expect(parsed.data?.id).toBe(name.replace(/\.json$/, ""))
  })

  it("has unique ids", () => {
    const ids = fixtures.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(fixtures.map((f) => [f.id, f] as const))("%s: every history row passes the Tautulli row schema", (_id, fixture) => {
    for (const row of [...fixture.history, ...fixture.lifetimeBefore2026]) {
      expect(tautulliHistoryRowSchema.safeParse(row).success).toBe(true)
    }
    for (const row of fixture.requests?.rows ?? []) {
      expect(overseerrRequestSchema.safeParse(row).success).toBe(true)
    }
  })

  it("keeps Overseerr rows only where the server has Overseerr", () => {
    for (const fixture of fixtures) expect(fixture.requests === null).toBe(!fixture.server.overseerr)
  })

  it("uses only example.com addresses", () => {
    for (const name of files) {
      const emails = JSON.stringify(readFixtureJson(name)).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []
      for (const email of emails) expect(email).toMatch(/@example\.com$/)
    }
  })

  it("keeps the heavy fixture under 2 MB", () => {
    expect(statSync(path.join(FIXTURE_DIR, "heavy.json")).size).toBeLessThan(2 * 1024 * 1024)
  })

  it("shares 200 distinct titles with the typesetting tests", () => {
    const keys = titles.titles.map((t) => `${t.kind}|${t.title}|${t.year}`)
    expect(keys).toHaveLength(200)
    expect(new Set(keys).size).toBe(200)
  })
})
