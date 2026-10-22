/**
 * The golden fixtures a dry run can use as its subject (P7.10), read with
 * `fs` from `evals/rewind/fixtures/` (listed in `outputFileTracingIncludes`
 * for the admin routes, so the standalone build ships them).
 *
 * @module lib/rewind/dry-run/fixtures
 */

import "server-only"

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { fixtureSchema, type Fixture } from "@/evals/rewind/fixture-schema"

const FIXTURES_DIR = path.join(process.cwd(), "evals", "rewind", "fixtures")

/** Every fixture id, sorted. */
async function listDryRunFixtures(): Promise<string[]> {
  const files = await readdir(FIXTURES_DIR)
  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort()
}

/** The fixture with this id, or null when there is none. Only listed ids reach the file system. */
export async function readDryRunFixture(id: string): Promise<Fixture | null> {
  if (!(await listDryRunFixtures()).includes(id)) return null
  return fixtureSchema.parse(JSON.parse(await readFile(path.join(FIXTURES_DIR, `${id}.json`), "utf8")))
}
