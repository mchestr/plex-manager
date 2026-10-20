/**
 * @jest-environment node
 */

/**
 * The stored Rewinds the E2E, visual, axe and performance specs seed
 * (`e2e/fixtures/rewind/<id>.v3.json`, P5.4) parse as v3 data and match what
 * the pipeline builds from the golden fixtures today, as
 * `npm run rewind:e2e-fixtures -- --check` does. Rebuild them with
 * `npm run rewind:e2e-fixtures`.
 */

import { readFileSync } from "node:fs"

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { buildE2EFixtureJson, e2eFixtureFile, E2E_FIXTURE_IDS } from "@/evals/rewind/e2e-fixtures"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

// The model registry loads the Prisma client; no query runs.
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const fixtures = loadFixtures()

describe.each(E2E_FIXTURE_IDS)("e2e/fixtures/rewind/%s.v3.json", (id) => {
  const stored = readFileSync(e2eFixtureFile(id), "utf8")

  it("parses as a v3 Rewind", () => {
    expect(RewindDataV3.safeParse(JSON.parse(stored)).error).toBeUndefined()
  })

  it("is what the pipeline builds from the golden fixture", async () => {
    const fixture = fixtures.find((f) => f.id === id)!
    expect(stored).toBe(await buildE2EFixtureJson(fixture))
  })
})
