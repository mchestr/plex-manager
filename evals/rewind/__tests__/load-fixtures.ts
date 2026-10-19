/**
 * Loads the committed fixtures for the eval tests.
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { fixtureSchema, type Fixture } from "../fixture-schema"

export const FIXTURE_DIR = path.join(__dirname, "..", "fixtures")

export function fixtureFiles(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
}

export function readFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"))
}

export function loadFixtures(): Fixture[] {
  return fixtureFiles().map((name) => fixtureSchema.parse(readFixtureJson(name)))
}
