import { z } from "zod"

/** The receipt's lines under the total, in page order. */
export const LEDGER_LINES = ["requests.approved", "requests.available", "requests.watched", "requests.pending", "requests.declined"] as const

/**
 * 14 Requests: the ledger lines the page prints, as fact ids, each above 0.
 * The counts are facts (`requests.*`); no request title is ever stored.
 */
export const RequestsDataSchema = z.strictObject({
  lines: z.array(z.enum(LEDGER_LINES)).max(LEDGER_LINES.length),
})

export type RequestsData = z.infer<typeof RequestsDataSchema>
