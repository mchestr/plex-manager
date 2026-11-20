/**
 * The Keep write in one transaction (TS 10.3 `keepCleanupTitle` step 5,
 * E33, owner-r2-2, architecture-r4-4, safety-r3-1). Server-only.
 *
 * 1. Serialize the Keeps of one member (a transaction lock on the member,
 *    `pg_advisory_xact_lock`), then count the member's active Keeps. At the
 *    limit: `limit`, and nothing is written. Two Keeps at the same time
 *    can never both pass the limit (security review S-01).
 * 2. Create the Keep with the `RestoreItem` of the kept row, so Undo can
 *    bring the row back. An older Keep of the same key that has expired ends
 *    first. An active Keep of the member is returned as it is.
 * 3. Exit the kept row and every Leaving soon row of its cascade
 *    (`cascadeWhere()`, TS 5.4) as `rescued`, reason `kept`: a kept season
 *    takes out its show row, a kept show its season rows. Rows in `deleting`
 *    and `held` rows stay. Each exit matches the row as it was read.
 * 4. Deleting check: after the exits, count the rows of the cascade in
 *    `deleting`. Above 0, the whole transaction rolls back (no Keep, no
 *    exit): `deleting`.
 * 5. An exit that matches zero rows rolls back too. The rows are read again:
 *    a `deleting` row gives `deleting`, a kept row that left Leaving soon
 *    gives `notLeaving`, else the transaction runs once more on the fresh
 *    rows. A second zero-row exit gives `deleting`.
 * 6. Two Keeps of one title by one member at the same time: the second
 *    meets the unique index of `activeKey`, rolls back, and returns the
 *    first one's Keep.
 *
 * @module lib/cleanup/actions/keeps/keep-tx
 */

import "server-only"

import { isUniqueError } from "@/lib/cleanup/actions/keeps/result"
import { cascadeWhere } from "@/lib/cleanup/identity/keys"
import { countActiveKeeps, createKeep, keepActiveKey, type ProtectionTitle, restoreOf } from "@/lib/cleanup/protections"
import { ExitSkippedError, exitItem } from "@/lib/cleanup/run/exit"
import { TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import type { CleanupItem, CleanupProtection } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The states of a row in Leaving soon: the rows that a Keep takes out. */
const LEAVING_STATES = ["leaving", "approved"]

type KeepWrite =
  | { kind: "kept"; keep: CleanupProtection; created: boolean; exited: number }
  | { kind: "deleting" }
  | { kind: "notLeaving" }
  | { kind: "limit" }

interface KeepWriteInput {
  memberId: string
  keepDays: number
  /** The most active Keeps a member may hold. */
  keepLimit: number
  now: Date
}

/** Thrown inside the transaction to roll it back when a row of the cascade is `deleting` (E33). */
class DeletingRollback extends Error {
  constructor() {
    super("cleanup.keep_deleting")
    this.name = "DeletingRollback"
  }
}

/**
 * The ids that a title key names: `tmdb:1` gives `{ tmdb: 1 }`. Null for `rk:`
 * keys. A season holds its show's.
 *
 * @internal Exported for the tests.
 */
export function idsOfTitleKey(titleKey: string): ProtectionTitle["externalIds"] {
  const [kind, value = ""] = titleKey.split(":", 2)
  if (kind === "imdb" && value) return { imdb: value }
  if (!/^\d+$/.test(value)) return null
  if (kind === "tmdb") return { tmdb: Number(value) }
  return kind === "tvdb" ? { tvdb: Number(value) } : null
}

/** The title facts that the Keep copies from the kept row. */
function titleOfRow(row: CleanupItem): ProtectionTitle {
  const { itemKey, titleKey, title, year, seasonNumber, sectionId, ratingKey } = row
  return { itemKey, level: row.level as Level, titleKey, title, year, seasonNumber, sectionId, ratingKey, externalIds: idsOfTitleKey(titleKey) }
}

/** The kept row and every row of its cascade, in any state. */
export function readCascade(kept: Pick<CleanupItem, "itemKey" | "level" | "titleKey">): Promise<CleanupItem[]> {
  return prisma.cleanupItem.findMany({ where: cascadeWhere({ itemKey: kept.itemKey, level: kept.level as Level, titleKey: kept.titleKey }) })
}

/** Waits for every other Keep transaction of the member, until this transaction ends. */
async function lockMember(tx: PrismaTransactionClient, memberId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cleanup-keep:${memberId}`}, 0))`
}

async function write(tx: PrismaTransactionClient, kept: CleanupItem, rows: readonly CleanupItem[], input: KeepWriteInput): Promise<KeepWrite> {
  const { memberId, keepDays, keepLimit, now } = input
  await lockMember(tx, memberId)
  if ((await countActiveKeeps(tx, memberId, now)) >= keepLimit) return { kind: "limit" }
  const made = await createKeep(tx, { title: titleOfRow(kept), memberId, keepDays, restore: restoreOf(kept, now), now })
  if (!made.created) return { kind: "kept", keep: made.keep, created: false, exited: 0 }
  const exiting = rows.filter((row) => LEAVING_STATES.includes(row.state))
  for (const row of exiting) await exitItem(row, { kind: "rescued", reason: "kept", actorId: memberId, audit: null, tx, rollback: true })
  const cascade = cascadeWhere(titleOfRow(kept))
  const deleting = await tx.cleanupItem.count({ where: { AND: [cascade, { state: "deleting" }] } })
  if (deleting > 0) throw new DeletingRollback()
  return { kind: "kept", keep: made.keep, created: true, exited: exiting.length }
}

/** The member's active Keep of the title, after a second Keep met the unique index. */
async function existingKeep(itemKey: string, memberId: string): Promise<KeepWrite | null> {
  const keep = await prisma.cleanupProtection.findUnique({ where: { activeKey: keepActiveKey(itemKey, memberId) } })
  return keep ? { kind: "kept", keep, created: false, exited: 0 } : null
}

/** What the rows read again say before the next round, or null to run it. */
function freshState(rows: readonly CleanupItem[], itemKey: string): KeepWrite | null {
  if (rows.some((row) => row.state === "deleting")) return { kind: "deleting" }
  const kept = rows.find((row) => row.itemKey === itemKey)
  return kept && LEAVING_STATES.includes(kept.state) ? null : { kind: "notLeaving" }
}

/**
 * Keeps the title with the E33 check. `rows` are the kept row and its
 * cascade as the action read them (step 2).
 */
export async function writeKeep(itemKey: string, rows: CleanupItem[], input: KeepWriteInput): Promise<KeepWrite> {
  let current = rows
  for (let round = 0; round < 2; round++) {
    const kept = current.find((row) => row.itemKey === itemKey)
    if (!kept) return { kind: "notLeaving" }
    try {
      return await prisma.$transaction((tx) => write(tx, kept, current, input), TRANSACTION_OPTIONS)
    } catch (error) {
      if (error instanceof DeletingRollback) return { kind: "deleting" }
      if (isUniqueError(error)) {
        const keep = await existingKeep(itemKey, input.memberId)
        if (keep) return keep
      }
      if (!(error instanceof ExitSkippedError)) throw error
    }
    if (round > 0) break
    current = await readCascade(kept)
    const state = freshState(current, itemKey)
    if (state) return state
  }
  return { kind: "deleting" }
}
