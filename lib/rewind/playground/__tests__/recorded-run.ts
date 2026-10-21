/**
 * A recorded dry run for the playground's tests: a golden fixture through the
 * real pipeline, the model answering from `evals/rewind/recordings/hand`,
 * stored the way the `REWIND_DRY_RUN` job stores it (a JSON round trip of the
 * trail). Test files mock `@/lib/prisma` and the logger before calling it,
 * and run in the node environment. Its view, which the jsdom pane tests read,
 * is committed at {@link RECORDED_VIEW_FILE}.
 */

import path from "node:path"

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { readRecording, replayDeps, runFixture } from "@/evals/rewind/harness"
import type { CompletedDryRun } from "@/lib/rewind/dry-run/store"

const MODEL = { provider: "anthropic", id: "claude-sonnet-5-5" } as const

export const RECORDED_PREVIEW_ID = "7d4f9a52-3b1e-4c8a-9f20-1a2b3c4d5e6f"

export const RECORDED_VIEW_FILE = path.join(process.cwd(), "components/admin/rewind/playground/__tests__/recorded-view.json")

export async function recordedRun(fixtureId = "hostile-titles"): Promise<CompletedDryRun> {
  const fixture = loadFixtures().find((f) => f.id === fixtureId)
  if (!fixture) throw new Error(`No fixture ${fixtureId}`)
  const { deps } = replayDeps(readRecording("hand", fixtureId), MODEL)
  const { result } = await runFixture(fixture, MODEL, deps)
  if (result.status !== "completed") throw new Error(`${fixtureId} was skipped: ${result.reason}`)
  return {
    subject: { kind: "fixture", fixtureId },
    year: result.data.year,
    adminId: "admin-1",
    finishedAt: "2026-12-08T10:00:00.000Z",
    status: "completed",
    data: result.data,
    trail: JSON.parse(JSON.stringify(result.trail)) as Record<string, unknown>,
  }
}
