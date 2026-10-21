"use server"

import { randomUUID } from "node:crypto"

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { selectedReplay } from "@/lib/llm/replay"
import { prisma } from "@/lib/prisma"
import { getRewindQueue } from "@/lib/queue/rewind-producers"
import { JOB_TYPES, type RewindDryRunPayload } from "@/lib/queue/types"
import { estimateDryRun, type DryRunEstimate } from "@/lib/rewind/dry-run/estimate"
import { readDryRunFixture } from "@/lib/rewind/dry-run/fixtures"
import { DryRunInput, previewIdSchema, REPLAY_SELECTED } from "@/lib/rewind/dry-run/input"
import { readDryRun, type StoredDryRun } from "@/lib/rewind/dry-run/store"

/** What an estimate costs before the run, from the price table; no provider is called. Admin only. @public P8.8's playground shows it. */
export const estimateRewindDryRun = adminAction({
  input: DryRunInput,
  fallbackError: "Could not estimate the dry run",
  handler: async (input) => ok<DryRunEstimate>(await estimateDryRun(input)),
})

/**
 * Queues a dry run of the Rewind pipeline on a member or a golden fixture
 * (P7.10): admin only, 10 per admin per 10 minutes (`rw:dryrun`). Returns the
 * preview id that `?preview=` and `getRewindDryRun` read once it finishes.
 * The model `replay:selected` (P7.11) takes a fixture and a selected model
 * with recordings.
 */
export const startRewindDryRun = adminAction({
  input: DryRunInput,
  rateLimit: { name: "rw:dryrun" },
  fallbackError: "Could not start the dry run",
  handler: async (input, { userId }) => {
    const { subject } = input
    if (input.model === REPLAY_SELECTED) {
      if (subject.kind !== "fixture") return fail("VALIDATION", "Recorded answers exist only for fixtures")
      if (!selectedReplay()) return fail("VALIDATION", "No model has been selected yet")
    }
    if (subject.kind === "fixture") {
      const fixture = await readDryRunFixture(subject.fixtureId)
      if (!fixture) return fail("NOT_FOUND", "No fixture has that id")
      if (fixture.window.year !== input.year) return fail("VALIDATION", `The fixture covers ${fixture.window.year}`)
    } else if (!(await prisma.user.findUnique({ where: { id: subject.userId }, select: { id: true } }))) {
      return fail("NOT_FOUND", "No member has that id")
    }

    const previewId = randomUUID()
    const payload: RewindDryRunPayload = { previewId, adminId: userId, input }
    await getRewindQueue("rewind-aux").add(JOB_TYPES.REWIND_DRY_RUN, payload, { jobId: previewId, attempts: 1 })
    return ok({ previewId })
  },
})

export type RewindDryRunState = { status: "pending" } | StoredDryRun

/** A dry run's state: pending while its job waits or runs, then its stored result for an hour. Admin only. */
export const getRewindDryRun = adminAction({
  input: z.strictObject({ id: previewIdSchema }),
  fallbackError: "Could not read the dry run",
  handler: async ({ id }) => {
    const stored = await readDryRun(id)
    if (stored) return ok<RewindDryRunState>(stored)
    const job = await getRewindQueue("rewind-aux").getJob(id)
    const state = job ? await job.getState() : null
    if (state && state !== "completed" && state !== "failed" && state !== "unknown") return ok<RewindDryRunState>({ status: "pending" })
    return fail("NOT_FOUND", "That dry run has expired or never existed")
  },
})

