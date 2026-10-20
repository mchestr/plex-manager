/**
 * Keeps `e2e/fixtures/rewind/heavy-issue.json` in step with the heavy golden
 * fixture as the pipeline builds it. Playwright cannot load the Jest helpers
 * (they reach `server-only` modules), so the E2E specs read this file.
 * Regenerate with `UPDATE_E2E_FIXTURES=1 npx jest e2e-issue-fixture`.
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { fixtureIssue } from "./helpers/fixture-issue"

const FILE = path.join(process.cwd(), "e2e/fixtures/rewind/heavy-issue.json")

it("matches the heavy fixture issue", async () => {
  const issue = await fixtureIssue("heavy", { serial: "K7Q4", nthRewind: 4 })
  const stored = {
    edition: issue.edition,
    facts: issue.facts,
    pages: issue.pages.map(({ type, data }) => ({ type, data })),
    archetype: issue.archetype,
  }
  const json = `${JSON.stringify(stored, null, 2)}\n`
  if (process.env.UPDATE_E2E_FIXTURES) writeFileSync(FILE, json)
  expect(readFileSync(FILE, "utf8")).toBe(json)
})
