/**
 * Each Tautulli user's newest play, and the oldest play on the server, for
 * the daily last seen read (`lib/inactivity/sync.ts`).
 *
 * `get_users` has no last seen; `get_users_table`, the DataTables call behind
 * Tautulli's Users page, does. Its `data` is a page object
 * `{ recordsFiltered, recordsTotal, draw, data: Row[] }`, 25 rows long unless
 * asked otherwise.
 *
 * ## Paging
 *
 * Pages of {@link PAGE_LENGTH} rows in `friendly_name` order, until a short
 * page, the end of `recordsFiltered`, or {@link MAX_PAGES} pages. A user seen
 * twice (a rename moved them between pages) keeps the newer play, and counts
 * as not keeping history if either row says so. Any failed page fails the
 * whole read: half a read must not count as a member not being seen.
 *
 * ## Rows
 *
 * Only three fields survive the parse; the email, IP address and names on the
 * row are dropped. A row that does not parse is left out and counted.
 *
 * | Field          | Kept as                                                          |
 * |----------------|------------------------------------------------------------------|
 * | `user_id`      | `userId`: the plex.tv account id (a number or numeric string)    |
 * | `last_seen`    | `lastSeen`: epoch seconds as a `Date`; null, `""`, 0 or less is `null`; other text, or no `last_seen` at all, drops the row |
 * | `keep_history` | `keepHistory`: true only for 1, `"1"`, `true` or `"Checked"` (any case); false for anything else, also `""`, null or absent |
 *
 * `keep_history` fails closed: Tautulli 2.10 and later send 0 or 1, but older
 * versions send `"Checked"` or `""`, and a value the read does not know must
 * never count as history kept.
 *
 * ## Oldest play
 *
 * {@link getOldestPlay} reads the first row of `get_history` in date order:
 * when Tautulli's recorded history starts, or null when it has none. The row
 * carries `date` and `started` (epoch seconds); `date` is used, else
 * `started`, and a row with neither fails the read.
 *
 * @module lib/connections/tautulli-last-seen
 */

import { z } from "zod"

import type { ServiceErrorCode, ServiceResult } from "@/lib/connections/http"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { createLogger } from "@/lib/utils/logger"
import type { TautulliParsed } from "@/lib/validations/tautulli"

const logger = createLogger("TAUTULLI_LAST_SEEN")

type Endpoint = Pick<TautulliParsed, "url" | "apiKey">

/** Rows per `get_users_table` call. @internal */
export const PAGE_LENGTH = 500
/** The most pages one read asks for: 50,000 users. @internal */
export const MAX_PAGES = 100
/** The latest instant a `Date` can hold. */
const MAX_DATE_MS = 8.64e15

/** One Tautulli user, reduced to what last seen needs. */
interface TautulliLastSeenRow {
  /** The plex.tv account id (`User.plexUserId` as a number). */
  userId: number
  /** Start of the user's newest play; null when Tautulli has none. */
  lastSeen: Date | null
  /** Whether Tautulli records this user's plays ("Keep history"). */
  keepHistory: boolean
}

export interface TautulliLastSeen {
  rows: TautulliLastSeenRow[]
  /** Rows left out because they did not parse. */
  dropped: number
}

const numeric = z.string().regex(/^\d+(\.\d+)?$/).transform(Number)

/** Epoch seconds as Tautulli sends them; blank or null when it has none. */
const epochSeconds = z.union([z.number(), numeric, z.literal(""), z.null(), z.undefined()])

/** History counts as kept only when Tautulli says so: 1 (2.10 and later) or "Checked" (before 2.10). */
function keepsHistory(value: unknown): boolean {
  if (typeof value === "string") return ["1", "checked"].includes(value.trim().toLowerCase())
  return value === 1 || value === true
}

const rowSchema = z
  .object({
    user_id: z.union([z.number(), numeric]).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
    last_seen: epochSeconds,
    keep_history: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  })
  .transform(
    (row): TautulliLastSeenRow => ({
      userId: row.user_id,
      lastSeen: toDate(row.last_seen),
      keepHistory: keepsHistory(row.keep_history),
    })
  )

const pageSchema = z.object({
  recordsFiltered: z.number().int().nonnegative(),
  data: z.array(z.unknown()),
})

/** A `get_history` page in date order: its first play's start, or null when the history is empty. */
const oldestPageSchema = z
  .object({
    data: z.array(
      z
        .object({ date: epochSeconds.optional(), started: epochSeconds.optional() })
        .transform((play) => toDate(play.date) ?? toDate(play.started))
        // A row without a time fails the read rather than passing as no history
        .pipe(z.date())
    ),
  })
  .transform((page) => page.data[0] ?? null)

function toDate(seconds: number | "" | null | undefined): Date | null {
  if (typeof seconds !== "number") return null
  const ms = seconds * 1000
  return Number.isFinite(ms) && ms > 0 && ms <= MAX_DATE_MS ? new Date(ms) : null
}

function merge(a: TautulliLastSeenRow, b: TautulliLastSeenRow): TautulliLastSeenRow {
  const lastSeen = !a.lastSeen || (b.lastSeen && b.lastSeen > a.lastSeen) ? b.lastSeen : a.lastSeen
  return { userId: a.userId, lastSeen, keepHistory: a.keepHistory && b.keepHistory }
}

/**
 * Every Tautulli user's newest play, read page by page from
 * `get_users_table`. A failed page is passed on as the read's failure.
 */
export async function listTautulliLastSeen(
  config: Endpoint,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<TautulliLastSeen, ServiceErrorCode | "TAUTULLI_ERROR">> {
  const rows = new Map<number, TautulliLastSeenRow>()
  let dropped = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * PAGE_LENGTH
    const params = { start, length: PAGE_LENGTH, order_column: "friendly_name", order_dir: "asc" }
    const result = await tautulliCommand(config, "get_users_table", params, pageSchema, { signal, timeoutMs: 60_000, attempts: 2 })
    if (!result.ok) return result

    for (const raw of result.data.data) {
      const row = rowSchema.safeParse(raw)
      if (!row.success) {
        dropped++
        continue
      }
      const seen = rows.get(row.data.userId)
      rows.set(row.data.userId, seen ? merge(seen, row.data) : row.data)
    }
    if (result.data.data.length < PAGE_LENGTH || start + PAGE_LENGTH >= result.data.recordsFiltered) {
      return { ok: true, data: { rows: [...rows.values()], dropped } }
    }
  }
  logger.warn("Stopped reading Tautulli users at the page limit", { pages: MAX_PAGES, users: rows.size })
  return { ok: true, data: { rows: [...rows.values()], dropped } }
}

/**
 * When Tautulli's oldest recorded play started, or null when it has no
 * history. The sweep checks that the history covers the whole threshold
 * before it trusts a member's missing or old play.
 */
export async function getOldestPlay(
  config: Endpoint,
  { signal }: { signal?: AbortSignal } = {}
): Promise<ServiceResult<Date | null, ServiceErrorCode | "TAUTULLI_ERROR">> {
  const params = { start: 0, length: 1, order_column: "date", order_dir: "asc" }
  return tautulliCommand(config, "get_history", params, oldestPageSchema, { signal, timeoutMs: 60_000, attempts: 2 })
}
