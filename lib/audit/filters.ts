/**
 * The audit log's URL filters and the query they make. Pure: the page parses
 * the URL with {@link parseAuditFilters}, and the loader turns the result into
 * a Prisma `where` with {@link auditWhere}.
 *
 * | Param        | Accepts                                      | Matches                                                             |
 * |--------------|----------------------------------------------|---------------------------------------------------------------------|
 * | `category`   | a category of `lib/audit/events.ts`          | any event type in the category                                      |
 * | `type`       | an event type the enum knows                 | that type                                                           |
 * | `actor`      | a user id, or `system`, `setup` or `unknown` | events by them (`actorUserId`)                                      |
 * | `member`     | a user id                                    | events involving them: by them or about them (`targetUserId`)       |
 * | `run`        | an inactivity run id                         | that run's `INACTIVITY_SWEEP_RUN` and `MEMBER_UNSHARED` rows        |
 * | `from`, `to` | an inclusive day range in the server zone    | events from the first midnight to the midnight after the last day   |
 *
 * Anything a param does not accept reads as unset. The filters combine with
 * AND, so a type outside the chosen category matches nothing. Ids are
 * `recordIdSchema` ids; the non-user actors match that pattern too.
 *
 * @module lib/audit/filters
 */

import { z } from "zod"

import { AUDIT_CATEGORIES, AUDIT_EVENT_NAMES, type AuditCategory, type AuditEventName, typesIn } from "@/lib/audit/events"
import type { Prisma } from "@/lib/generated/prisma/client"
import { dateRangeToInstants, type DayRange, parseDateRange } from "@/lib/ui/date-range"
import { recordIdSchema } from "@/lib/validations/params"

export interface AuditFilters {
  category?: AuditCategory
  type?: AuditEventName
  actor?: string
  member?: string
  run?: string
  range: DayRange | null
}

type Params = Record<string, string | string[] | undefined>

/** The rows an inactivity run writes, each with its id in `details.runId`. */
const RUN_TYPES: AuditEventName[] = ["INACTIVITY_SWEEP_RUN", "MEMBER_UNSHARED"]

const filterSchema = z.object({
  category: z.enum(AUDIT_CATEGORIES).optional().catch(undefined),
  type: z.enum(AUDIT_EVENT_NAMES).optional().catch(undefined),
  actor: recordIdSchema.optional().catch(undefined),
  member: recordIdSchema.optional().catch(undefined),
  run: recordIdSchema.optional().catch(undefined),
})

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** The filters in the URL; anything a param does not accept reads as unset. */
export function parseAuditFilters(params: Params): AuditFilters {
  const filters = filterSchema.parse({
    category: single(params.category),
    type: single(params.type),
    actor: single(params.actor),
    member: single(params.member),
    run: single(params.run),
  })
  return { ...filters, range: parseDateRange(params) }
}

/** Whether any filter is set, so an empty list says "no match" rather than "nothing yet". */
export function hasAuditFilters({ range, ...filters }: AuditFilters): boolean {
  return range !== null || Object.values(filters).some((value) => value !== undefined)
}

/** The filters as their URL params (ids and day keys, never names): what `AUDIT_LOG_VIEWED` records. */
export function auditFilterParams({ range, ...filters }: AuditFilters) {
  return { ...filters, from: range?.from, to: range?.to }
}

/** The filters as one Prisma `where`, each condition ANDed with the others; `zone` places the day range. */
export function auditWhere({ category, type, actor, member, run, range }: AuditFilters, zone: string): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = []
  if (category) and.push({ type: { in: typesIn(category) } })
  if (type) and.push({ type })
  if (actor) and.push({ actorUserId: actor })
  if (member) and.push({ OR: [{ actorUserId: member }, { targetUserId: member }] })
  if (run) and.push({ type: { in: RUN_TYPES }, details: { path: ["runId"], equals: run } })
  if (range) and.push({ createdAt: dateRangeToInstants(range, zone) })
  return { AND: and }
}
