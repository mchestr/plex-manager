/**
 * The recorded model answers for one fixture (P5.9, P5.13):
 * `recordings/<set>/<fixture>.json`, where `<set>` is `hand` (written by
 * hand) or a model's slug (written by `npm run eval:rewind -- --record`).
 *
 * A call holds the JSON the model returned (`output`), its raw text when the
 * output did not parse (`text`), or neither when the call failed with no
 * answer (`finishReason: "error"`). A live recording also keeps the served
 * model, the token usage and the latency, so a replay reports the run's real
 * cost and latency offline.
 *
 * @module evals/rewind/recording-schema
 */

import { z } from "zod"

const tokenUsage = z.object({
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  cacheWriteTokens: z.number().optional(),
  outputTokens: z.number(),
  reasoningTokens: z.number(),
})

const recordedCall = z
  .object({
    kind: z.enum(["copy", "repair"]),
    output: z.record(z.string(), z.unknown()).optional(),
    text: z.string().optional(),
    /** How the call ended when it was not a normal stop. */
    finishReason: z.enum(["length", "refusal", "content-filter", "error"]).optional(),
    modelId: z.string().optional(),
    usage: tokenUsage.optional(),
    latencyMs: z.number().nonnegative().optional(),
  })
  .refine((call) => call.output !== undefined || call.text !== undefined || call.finishReason !== undefined, {
    message: "A call records an output, its text or how it failed",
  })

export type RecordedCall = z.infer<typeof recordedCall>

export const recordingSchema = z.object({
  fixture: z.string(),
  promptVersion: z.string(),
  /** `<provider>:<id>` of a live recording; hand recordings have none. */
  model: z.string().optional(),
  note: z.string().optional(),
  calls: z.array(recordedCall),
})

export type Recording = z.infer<typeof recordingSchema>
