"use server"

/**
 * One active row per service (P11.31, DUP-05) from settings: without
 * `confirm` it lists the services with more than one active row
 * (`SERVICE_ROWS_AUDITED`); with `confirm: true`, a keep for every listed
 * table and `dumpTaken: true` it deactivates the others in one transaction
 * (`SERVICE_ROWS_DEDUPED`). `npm run services:rows-audit` and
 * `services:rows-apply` do the same from a checkout.
 *
 * @module actions/admin/service-rows
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { applyServiceRowKeeps, type ServiceRowKeeps } from "@/lib/services/duplicate-apply"
import { auditServiceRows as listDuplicateServiceRows, SERVICE_TABLES, type DuplicateTable, type ServiceTable } from "@/lib/services/duplicate-audit"

const input = z.object({
  confirm: z.boolean().default(false),
  keeps: z.partialRecord(z.enum(SERVICE_TABLES), z.string().min(1).max(64)).default({}),
  /** The admin confirms a `pg_dump` was taken just now; the app cannot take one. */
  dumpTaken: z.boolean().default(false),
})

type ServiceRowsResult =
  | { applied: false; tables: DuplicateTable[] }
  | { applied: true; kept: ServiceRowKeeps; deactivated: Partial<Record<ServiceTable, string[]>> }

const REFUSALS = {
  KEEP_MISSING: "Choose the row to keep for every service listed.",
  KEEP_UNKNOWN: "A chosen row is no longer active. Check again.",
} as const

export const auditServiceRows = adminAction({
  input,
  rateLimit: { name: "admin" },
  fallbackError: "Could not check the service rows",
  handler: async ({ confirm, keeps, dumpTaken }, { userId }): Promise<ActionResult<ServiceRowsResult>> => {
    if (!confirm) {
      const tables = await listDuplicateServiceRows()
      logAuditEvent(AuditEventType.SERVICE_ROWS_AUDITED, userId, {
        tables: tables.map((entry) => ({ table: entry.table, ids: entry.rows.map((row) => row.id), todaysPickId: entry.todaysPickId })),
      })
      return ok({ applied: false, tables })
    }

    if (!dumpTaken) return fail("VALIDATION", "Take a database dump before you deactivate rows.")
    const result = await applyServiceRowKeeps({ keeps, actor: userId, dump: "confirmed by the admin in settings" })
    if (!result.ok) return fail("CONFLICT", `${REFUSALS[result.code]} (${result.tables.join(", ")})`)
    revalidatePath("/admin/settings")
    return ok({ applied: true, kept: result.kept, deactivated: result.deactivated })
  },
})
