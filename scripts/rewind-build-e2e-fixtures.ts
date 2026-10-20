/**
 * `npm run rewind:e2e-fixtures`: writes the stored v3 Rewinds the E2E,
 * visual, axe and performance specs seed (P5.4) to
 * `e2e/fixtures/rewind/<id>.v3.json`; see `evals/rewind/e2e-fixtures.ts`.
 *
 *   npm run rewind:e2e-fixtures            (writes the files)
 *   npm run rewind:e2e-fixtures -- --check (exits 1 when a file has drifted)
 *
 * Playwright cannot load the pipeline (it reaches `server-only`), so the
 * specs read the files instead (`e2e/helpers/seed-rewind.ts`).
 *
 * @module scripts/rewind-build-e2e-fixtures
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

async function main() {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } })

  // The model registry imports the Prisma client, which needs a URL to load; it never connects.
  process.env.DATABASE_URL ??= "postgresql://e2e@localhost:5432/e2e_fixtures_unused"
  const [{ buildE2EFixtureJson, e2eFixtureFile, E2E_FIXTURE_IDS }, { loadFixtures }] = await Promise.all([
    import("@/evals/rewind/e2e-fixtures"),
    import("@/evals/rewind/__tests__/load-fixtures"),
  ])

  const fixtures = loadFixtures()
  const drifted: string[] = []
  for (const id of E2E_FIXTURE_IDS) {
    const fixture = fixtures.find((f) => f.id === id)
    if (!fixture) throw new Error(`No golden fixture "${id}"`)
    const json = await buildE2EFixtureJson(fixture)
    const file = e2eFixtureFile(id)
    const name = path.relative(process.cwd(), file)
    if (!values.check) {
      writeFileSync(file, json)
      console.log(`Wrote ${name}`)
      continue
    }
    let current = ""
    try {
      current = readFileSync(file, "utf8")
    } catch {
      // A missing file has drifted too.
    }
    if (current !== json) drifted.push(name)
  }

  if (drifted.length > 0) {
    console.error(`Out of date: ${drifted.join(", ")}. Run npm run rewind:e2e-fixtures.`)
    process.exit(1)
  }
  if (values.check) console.log("The E2E Rewind fixtures are current.")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
