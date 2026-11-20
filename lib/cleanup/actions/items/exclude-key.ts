/**
 * The exclusion of one title in its own transaction (TS 10.3
 * `excludeCleanupItems` step 2, E33, owner-r2-2, architecture-r5-3,
 * safety-r3-1). Server-only.
 *
 * 1. End an active exclusion of the key and create the new one.
 * 2. Exit every row of the key's cascade (`cascadeWhere()`, TS 5.4) that is
 *    in Leaving soon or held, with reason `excluded`: an excluded show takes
 *    out its seasons, an excluded season its show. Rows in `deleting` stay.
 * 3. Deleting check: after the exits, count the rows of the cascade in
 *    `deleting`. Above 0, the key's transaction rolls back: no exclusion row
 *    and no exit, and the key counts as skipped.
 * 4. An exit that matches zero rows rolls back too. The whole transaction
 *    runs once more on fresh rows; a second zero-row exit gives skipped.
 *
 * @module lib/cleanup/actions/items/exclude-key
 */

import "server-only"

import { RollbackKey } from "@/lib/cleanup/actions/items/result"
import { cascadeWhere } from "@/lib/cleanup/identity/keys"
import { createExclusion, type ProtectionTitle } from "@/lib/cleanup/protections"
import { ExitSkippedError, exitItem, exitKind } from "@/lib/cleanup/run/exit"
import { TRANSACTION_OPTIONS } from "@/lib/cleanup/run/show-raise"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"

/** What happened to one title: excluded with the count of rows that left Leaving soon, or skipped (E33). */
export type KeyExclusion = { kind: "excluded"; rescued: number; exited: number } | { kind: "skipped" }

export interface ExcludeKeyOptions {
  userId: string
  now: Date
  note: string | null
  expiresAt: Date | null
}

/** The rows that an exclusion takes out: every state but `deleting`. */
const EXITING_STATES = ["held", "leaving", "approved"]

async function exclude(tx: PrismaTransactionClient, title: ProtectionTitle, options: ExcludeKeyOptions): Promise<KeyExclusion> {
  const { userId, now, note, expiresAt } = options
  await createExclusion(tx, { title, createdBy: userId, note, expiresAt, now })
  const cascade = cascadeWhere(title)
  const rows = await tx.cleanupItem.findMany({ where: { AND: [cascade, { state: { in: EXITING_STATES } }] } })
  let rescued = 0
  for (const row of rows) {
    const kind = exitKind(row.state, "excluded")
    await exitItem(row, { kind, reason: "excluded", actorId: userId, audit: null, tx, rollback: true })
    if (kind === "rescued") rescued += 1
  }
  const deleting = await tx.cleanupItem.count({ where: { AND: [cascade, { state: "deleting" }] } })
  if (deleting > 0) throw new RollbackKey()
  return { kind: "excluded", rescued, exited: rows.length }
}

/** Excludes one title, with the E33 check. A conflict error of PostgreSQL is thrown to the caller. */
export async function excludeKey(title: ProtectionTitle, options: ExcludeKeyOptions): Promise<KeyExclusion> {
  for (let round = 0; round < 2; round++) {
    try {
      return await prisma.$transaction((tx) => exclude(tx, title, options), TRANSACTION_OPTIONS)
    } catch (error) {
      if (error instanceof RollbackKey) return { kind: "skipped" }
      if (!(error instanceof ExitSkippedError)) throw error
    }
  }
  return { kind: "skipped" }
}
