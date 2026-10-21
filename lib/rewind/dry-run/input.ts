/**
 * What an admin dry run takes (P7.10): the subject (a member or a golden
 * fixture), the year, and this run's model, prompt version, effort, style
 * guide and copy policy. Shared by the playground actions and the
 * `REWIND_DRY_RUN` payload.
 *
 * @module lib/rewind/dry-run/input
 */

import { z } from "zod"

import type { EffortLevel } from "@/lib/llm/models"
import { recordIdSchema } from "@/lib/validations/params"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { styleGuideSchema } from "@/lib/validations/prompt"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"

export const DRY_RUN_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly EffortLevel[]

/**
 * The model id that replays the selected model's recorded answers for a
 * fixture (P7.11, `lib/llm/replay.ts`): no provider is called and nothing is
 * billed. Fixtures only.
 */
export const REPLAY_SELECTED = "replay:selected"

/** A fixture id is a file name in `evals/rewind/fixtures/` without `.json`. */
const fixtureIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Invalid fixture id")

export const DryRunSubject = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("member"), userId: recordIdSchema }),
  z.strictObject({ kind: z.literal("fixture"), fixtureId: fixtureIdSchema }),
])
export type DryRunSubject = z.infer<typeof DryRunSubject>

export const DryRunInput = z.strictObject({
  subject: DryRunSubject,
  year: yearSchema,
  /** A model on the Rewind provider for this run only; the provider's own model when absent. */
  model: z.string().trim().min(1).max(120).optional(),
  promptVersion: z.literal(PROMPT_VERSION).default(PROMPT_VERSION),
  effort: z.enum(DRY_RUN_EFFORTS).default("low"),
  /** Replaces the stored style guide for this run; null runs with none, absent keeps the stored one. */
  styleGuide: styleGuideSchema.nullable().optional(),
  /** `no-llm` is "Templates only". */
  copyPolicy: z.enum(["default", "no-llm"]).default("default"),
})
export type DryRunInput = z.output<typeof DryRunInput>

/** A dry run's id: the preview id in `?preview=` and the BullMQ job id. */
export const previewIdSchema = z.uuid()
