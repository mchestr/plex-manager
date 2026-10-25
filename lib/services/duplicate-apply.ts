/**
 * Leaves one active row per service (P11.31, DUP-05): keeps the row the owner
 * chose for each table the audit lists and deactivates the others.
 *
 * ## Order
 *
 * In one `$transaction`:
 * 1. Read every table's active ids again, so the check sees what the writes will.
 * 2. Refuse (`KEEP_MISSING`) when a table with more than one active row has
 *    no keep, and (`KEEP_UNKNOWN`) when a keep names no active row of its
 *    table. A refusal writes nothing.
 * 3. Deactivate every other active row of each listed table, and write one
 *    `SERVICE_ROWS_DEDUPED` audit row with the kept and deactivated ids.
 *
 * Nothing listed means nothing to do: a second run with the same keeps
 * writes nothing and records nothing. The dump the apply needs first is the
 * caller's (the script's `--dump`, the action's `dumpTaken`).
 *
 * @module lib/services/duplicate-apply
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { SERVICE_TABLES, tableDelegate, type ServiceTable } from "@/lib/services/duplicate-audit"

export type ServiceRowKeeps = Partial<Record<ServiceTable, string>>

export type ApplyServiceRowsResult =
  | { ok: true; kept: ServiceRowKeeps; deactivated: Partial<Record<ServiceTable, string[]>> }
  | { ok: false; code: "KEEP_MISSING" | "KEEP_UNKNOWN"; tables: ServiceTable[] }

interface ApplyOptions {
  keeps: ServiceRowKeeps
  /** The audit row's actor: the admin's id, or the script's name. */
  actor: string
  /** Where the dump taken before the apply lives, or how it was confirmed. */
  dump: string
}

export function applyServiceRowKeeps({ keeps, actor, dump }: ApplyOptions): Promise<ApplyServiceRowsResult> {
  return prisma.$transaction(async (tx): Promise<ApplyServiceRowsResult> => {
    const active = new Map<ServiceTable, string[]>()
    for (const table of SERVICE_TABLES) {
      const rows = await tableDelegate(tx, table).findMany({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
      active.set(table, rows.map((row) => row.id))
    }

    const listed = SERVICE_TABLES.filter((table) => (active.get(table)?.length ?? 0) > 1)
    const missing = listed.filter((table) => !keeps[table])
    if (missing.length > 0) return { ok: false, code: "KEEP_MISSING", tables: missing }
    const unknown = SERVICE_TABLES.filter((table) => {
      const keep = keeps[table]
      return keep !== undefined && !active.get(table)?.includes(keep)
    })
    if (unknown.length > 0) return { ok: false, code: "KEEP_UNKNOWN", tables: unknown }

    const kept: ServiceRowKeeps = {}
    const deactivated: Partial<Record<ServiceTable, string[]>> = {}
    for (const table of listed) {
      const keep = keeps[table] as string
      const others = (active.get(table) ?? []).filter((id) => id !== keep)
      await tableDelegate(tx, table).updateMany({ where: { id: { in: others } }, data: { isActive: false } })
      kept[table] = keep
      deactivated[table] = others
    }
    if (listed.length > 0) {
      await recordAuditEvent(AuditEventType.SERVICE_ROWS_DEDUPED, actor, { kept, deactivated, dump }, tx)
    }
    return { ok: true, kept, deactivated }
  })
}
