import { z } from "zod"

import { PROBLEM_CODES } from "@/lib/problem-reports/taxonomy"
import { ratingKeySchema } from "@/lib/validations/params"

export const PROBLEM_NOTE_MAX = 500
/** The longest internal note an admin keeps on a report. */
export const ADMIN_NOTE_MAX = 2000

/**
 * A note in someone's own words, which another person reads and Discord may
 * echo: format characters (bidi controls, zero-width spaces) dropped, other
 * control characters except line breaks as spaces, trimmed, at most `max`
 * characters; blank is null.
 */
const plainNoteSchema = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) =>
      value
        .replace(/\r\n?/g, "\n")
        .replace(/\p{Cf}/gu, "")
        .replace(/[^\P{Cc}\n]/gu, " ")
        .trim()
    )
    .pipe(z.string().max(max))
    .optional()
    .transform((value) => value || null)

/** A member's note, which the server admin reads. */
const problemNoteSchema = plainNoteSchema(PROBLEM_NOTE_MAX)

const problemCodeSchema = z.enum(PROBLEM_CODES)

export const problemReportIdSchema = z.string().min(1).max(100)

/** The answers to "Does anything else play on {player}?". */
const DEVICE_ANSWERS = ["others_play", "nothing_plays", "not_tried"] as const
export type DeviceAnswer = (typeof DEVICE_ANSWERS)[number]

/** `reportProblem`'s input. */
export const reportProblemInputSchema = z.object({
  ratingKey: ratingKeySchema,
  problem: problemCodeSchema,
  note: problemNoteSchema,
  device: z.enum(DEVICE_ANSWERS).optional(),
})

/** An `ALSO_REPORTED` event's data: a second member's problem and note, or nothing for a follow. */
export const alsoReportedDataSchema = z.looseObject({ problem: z.string().optional(), note: z.string().nullable().optional() })

/** A `CLOSED` event's data: why the report closed. */
export const closedEventDataSchema = z.object({ reason: z.enum(["cancelled", "admin"]) })

/** The evidence a `REPORTED` or `ALSO_REPORTED` event carries (`lib/problem-reports/evidence.ts`); anything else reads as none. */
const evidenceSchema = z
  .object({
    lastPlay: z.object({ player: z.string().nullable(), transcoded: z.boolean(), at: z.iso.datetime() }).nullable(),
    playedToEnd: z.boolean().nullable(),
  })
  .optional()
  .catch(undefined)

/** A `REPORTED` or `ALSO_REPORTED` event's data as the admin pages read it. */
export const reportEventDataSchema = z.looseObject({
  problem: z.string().optional().catch(undefined),
  note: z.string().nullable().optional().catch(undefined),
  device: z.enum(DEVICE_ANSWERS).optional().catch(undefined),
  evidence: evidenceSchema,
})

/** Mark fixed and Close: the outcome, the note the member who reported it sees, and the internal note. */
export const resolveProblemReportSchema = z.object({
  reportId: problemReportIdSchema,
  outcome: z.enum(["fixed", "closed"]),
  memberNote: plainNoteSchema(PROBLEM_NOTE_MAX),
  adminNote: plainNoteSchema(ADMIN_NOTE_MAX),
})

/** The admin's settings card. */
export const problemReportSettingsSchema = z.object({ enabled: z.boolean() })

/** `/report`'s search parameters: a title search, and the title whose sheet is open. */
export const reportSearchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  item: ratingKeySchema.optional().catch(undefined),
})
