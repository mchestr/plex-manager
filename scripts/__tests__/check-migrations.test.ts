/**
 * @jest-environment node
 */

/**
 * The migration naming check (P11.6): descriptive two-word names, rising
 * timestamps that are not in the future, a `migration.sql` in each folder,
 * and the legacy folders accepted as they are.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { checkMigrations, FUTURE_GRACE_DAYS } from "../migrations/check.mjs"

const MIGRATIONS = path.join(__dirname, "..", "..", "prisma", "migrations")
const LEGACY = ["20251122201244_combined_schema_updates", "20251129215232_latest", "20270115000000_p118_plex_server_machine_identifier"]
const NOW = new Date("2027-01-18T12:00:00Z")

function check(folders: string[], { missingSql = [] as string[], now = NOW } = {}) {
  return checkMigrations({
    folders: [...LEGACY, ...folders],
    legacy: LEGACY,
    hasSql: (folder: string) => !missingSql.includes(folder),
    now,
  })
}

describe("checkMigrations", () => {
  it("passes a descriptive name with a later timestamp", () => {
    expect(check(["20270116000006_p116_migration_naming", "20270117093000_add_member_export"])).toEqual([])
  })

  it("passes round timestamps", () => {
    expect(check(["20270118000000_season_close_2026"])).toEqual([])
  })

  it("fails latest", () => {
    expect(check(["20270116000000_latest"])).toEqual([expect.stringContaining("at least two lowercase words")])
  })

  it("fails a one-word name", () => {
    expect(check(["20270116000000_watchlist"])).toEqual([expect.stringContaining("at least two lowercase words")])
  })

  it("fails a name made only of deny-listed words", () => {
    expect(check(["20270116000000_latest_changes"])).toEqual([expect.stringContaining("does not say what")])
  })

  it("fails uppercase and other separators", () => {
    expect(check(["20270116000000_Add_Users", "20270116000001_add-users"])).toHaveLength(2)
  })

  it("fails a timestamp equal to the previous folder's", () => {
    expect(check(["20270116000000_add_member_export", "20270116000000_add_member_delete"])).toEqual([
      expect.stringContaining("timestamp must be later"),
    ])
  })

  // Folders apply in name order, so a decreasing timestamp is a new folder that
  // sorts before one already merged.
  it("fails a decreasing timestamp: a new folder older than the newest legacy folder", () => {
    expect(check(["20261201000000_add_member_export"])).toEqual([expect.stringContaining("later than the newest legacy folder")])
  })

  it("fails a future timestamp", () => {
    expect(check(["20990101000000_add_member_export"])).toEqual([expect.stringContaining("is in the future")])
  })

  it(`allows plan-calendar timestamps up to ${FUTURE_GRACE_DAYS} days ahead of the clock`, () => {
    const now = new Date("2026-10-22T00:00:00Z")
    expect(check(["20270216000000_add_member_export"], { now })).toEqual([])
    expect(check(["20270501000000_add_member_export"], { now })).toEqual([expect.stringContaining("is in the future")])
  })

  it("fails an impossible date", () => {
    expect(check(["20271332000000_add_member_export"])).toEqual([expect.stringContaining("not a valid UTC timestamp")])
  })

  it("fails a folder without migration.sql, legacy or not", () => {
    const missing = ["20270116000000_add_member_export", "20251129215232_latest"]
    expect(check(["20270116000000_add_member_export"], { missingSql: missing })).toEqual([
      "20251129215232_latest: has no migration.sql",
      "20270116000000_add_member_export: has no migration.sql",
    ])
  })

  it("passes the baseline folders, including the two that share 20270115000000", () => {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    const { folders: legacy } = JSON.parse(readFileSync(path.join(MIGRATIONS, ".legacy-names.json"), "utf8")) as { folders: string[] }

    expect(legacy).toEqual(expect.arrayContaining(["20251129215232_latest", "20251122201244_combined_schema_updates"]))
    expect(legacy).toEqual(expect.arrayContaining(["20270115000000_p1128_watchlist_sync_status", "20270115000000_p118_plex_server_machine_identifier"]))
    expect(
      checkMigrations({
        folders,
        legacy,
        hasSql: (folder: string) => existsSync(path.join(MIGRATIONS, folder, "migration.sql")),
        now: new Date(),
      })
    ).toEqual([])
  })
})
