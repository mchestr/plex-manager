/**
 * The stored v3 Rewinds the E2E, visual, axe and performance specs seed
 * (P5.4): P2.10's golden fixtures through the real pipeline,
 * `generateUserRewind({ mode: "dry-run", copyPolicy: "no-llm" })`, so the
 * copy is all template and no model is called. `scripts/rewind-build-e2e-fixtures.ts`
 * writes them and `__tests__/e2e-support/rewind-fixtures.test.ts` checks them.
 *
 * @module evals/rewind/e2e-fixtures
 */

import path from "node:path"

import type { StructuredDeps } from "@/lib/llm/generate-structured"

import type { Fixture } from "./fixture-schema"
import { runFixture } from "./harness"

/** The members the specs seed, by golden fixture id (`e2e/helpers/seed-rewind.ts`). */
export const E2E_FIXTURE_IDS = ["heavy", "median", "light", "extreme"] as const

const E2E_FIXTURE_DIR = path.join(process.cwd(), "e2e", "fixtures", "rewind")

export const e2eFixtureFile = (id: string) => path.join(E2E_FIXTURE_DIR, `${id}.v3.json`)

/** A fixed generation time, so a rebuild changes nothing when the inputs did not. */
const GENERATED_AT = "2026-12-01T12:00:00.000Z"

const noModel: StructuredDeps = {
  resolve: async () => {
    throw new Error("The E2E fixtures are template-only; no model may be called")
  },
  record: async () => {},
}

/** The fixture's stored issue as the file holds it. */
export async function buildE2EFixtureJson(fixture: Fixture): Promise<string> {
  const { result } = await runFixture(fixture, { provider: "anthropic", id: "claude-haiku-5-5" }, noModel, { copyPolicy: "no-llm" })
  if (result.status !== "completed") throw new Error(`${fixture.id}: skipped (${result.reason})`)
  return `${JSON.stringify({ ...result.data, generatedAt: GENERATED_AT }, null, 2)}\n`
}
