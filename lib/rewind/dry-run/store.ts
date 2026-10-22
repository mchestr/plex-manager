/**
 * Where a dry run's result waits for the admin (P7.10): one Redis key,
 * `rw:preview:<uuid>`, for an hour. Nothing about a dry run is written to
 * Postgres except its billed `LLMUsage` rows.
 *
 * The job writes on its long-lived connection; the preview page, the preview
 * card route and the playground read on the fail-fast request-path client,
 * and every read is parsed again (the issue with its v3 schema), so an old or
 * damaged entry reads as missing.
 *
 * @module lib/rewind/dry-run/store
 */

import "server-only"

import type Redis from "ioredis"
import { z } from "zod"

import { FIXTURE_USER_ID } from "@/evals/rewind/__tests__/stats-inputs"
import { getRequestPathRedis, readyWithin } from "@/lib/queue/connection"
import { createLogger } from "@/lib/utils/logger"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import { DryRunSubject, previewIdSchema } from "./input"

const logger = createLogger("REWIND_PREVIEW")

/** How long a read waits for the fail-fast client to finish connecting (it refuses commands until then). */
const READY_WAIT_MS = 2000

/** How long a preview lives, in seconds. */
const PREVIEW_TTL_SEC = 3600

const previewKey = (id: string) => `rw:preview:${id}`

const base = {
  subject: DryRunSubject,
  year: z.number().int(),
  adminId: z.string(),
  finishedAt: z.string(),
}

const StoredDryRun = z.discriminatedUnion("status", [
  z.object({
    ...base,
    status: z.literal("completed"),
    data: RewindDataV3,
    /** The pipeline's trail: facts, selection, raw output, grounding and cost. */
    trail: z.record(z.string(), z.unknown()),
  }),
  z.object({ ...base, status: z.literal("skipped"), reason: z.string() }),
  z.object({ ...base, status: z.literal("failed"), code: z.string() }),
])
export type StoredDryRun = z.infer<typeof StoredDryRun>
export type CompletedDryRun = Extract<StoredDryRun, { status: "completed" }>

/** Stores a finished dry run for {@link PREVIEW_TTL_SEC}. */
export async function saveDryRun(redis: Redis, id: string, value: StoredDryRun): Promise<void> {
  await redis.set(previewKey(id), JSON.stringify(value), "EX", PREVIEW_TTL_SEC)
}

/** The finished dry run, or null when it is unknown, expired, still running or unreadable. */
export async function readDryRun(id: string, redis: Redis = getRequestPathRedis()): Promise<StoredDryRun | null> {
  await readyWithin(redis, READY_WAIT_MS)
  const raw = await redis.get(previewKey(id))
  if (!raw) return null
  try {
    const parsed = StoredDryRun.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The completed dry run a `?preview=` value names for the route's year, or
 * null when the id is malformed, unknown, expired, unfinished, of another
 * year or unreadable (Redis down): the page then shows `not-found`.
 */
export async function readPreview(raw: unknown, year: number): Promise<{ id: string; run: CompletedDryRun } | null> {
  const id = previewIdSchema.safeParse(raw)
  if (!id.success) return null
  const run = await readDryRun(id.data).catch((error: unknown) => {
    logger.warn("Could not read a Rewind preview", { error: String(error) })
    return null
  })
  return run?.status === "completed" && run.data.year === year ? { id: id.data, run } : null
}

/** The user id the dry run ran as: the member's, or the fixture member's. Templates and share contexts read it. */
export function previewOwnerId(subject: DryRunSubject): string {
  return subject.kind === "member" ? subject.userId : FIXTURE_USER_ID
}
