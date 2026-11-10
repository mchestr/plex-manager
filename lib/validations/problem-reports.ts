import { z } from "zod"

import { FIX_ACTIONS } from "@/lib/problem-reports/fixes"
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

const fixActionSchema = z.enum(FIX_ACTIONS)

/** A `FIXED` event's data: the server admin marked it fixed, or a fix found it fixed. */
export const fixedEventDataSchema = z.object({ reason: z.enum(["admin", "fix"]), action: fixActionSchema.optional() })

/** A `FIX_STARTED` event's data: the fix and who started it. */
export const fixStartedDataSchema = z.object({ action: fixActionSchema, trigger: z.enum(["automatic", "web", "mcp"]) })

/** Why a fix handed a report back to the server admin (`lib/problem-reports/run.ts`). */
const TO_ADMIN_REASONS = [
  "OFF",
  "QUEUE_DOWN",
  "SEARCH_CAP",
  "BREAKER",
  "NO_SONARR",
  "NOT_IN_SONARR",
  "UNAVAILABLE",
  "NOTHING_MISSING",
  "NOT_ON_SERVER",
  "NOT_AIRED",
  "TOO_MANY",
  "NOT_FOUND",
  "PLEX_DIDNT_ADD",
  "REFRESHED",
  "REFRESH_FAILED",
] as const
export type ToAdminReason = (typeof TO_ADMIN_REASONS)[number]

/** A `TO_ADMIN` event's data: why the fix handed the report to the server admin. */
export const toAdminDataSchema = z.object({ reason: z.enum(TO_ADMIN_REASONS), action: fixActionSchema.optional() })

/** An admin's one-tap fix on a report. */
export const runProblemFixSchema = z.object({ reportId: problemReportIdSchema, action: fixActionSchema })

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
