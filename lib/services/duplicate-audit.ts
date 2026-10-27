/**
 * Lists the services with more than one active row (P11.31, DUP-05), so the
 * owner can choose which row to keep before `applyServiceRowKeeps()`
 * (`lib/services/duplicate-apply.ts`) deactivates the rest.
 *
 * ## What each listed table carries
 *
 * Every active row's id, URL host, `createdAt`, `updatedAt` and connection
 * result, and two picks:
 *
 * - `todaysPickId`: the row the app read before P11.31, an unordered
 *   `findFirst({ where: { isActive: true } })`, which is what this database
 *   returns for it now. It is the default keep, so the apply does not
 *   silently switch the config the app has been using.
 * - `orderedPickId`: the row the ordered reads of this release return
 *   (`orderBy: { updatedAt: "desc" }`). When it differs from today's pick,
 *   the app switches rows on deploy until the apply runs.
 *
 * `suggestedKeepId` is today's pick, unless that row fails its connection
 * test and another passes: then it is the newest passing row. The owner chooses.
 *
 * ## Special cases
 *
 * Nothing here returns or prints a key or token (those columns are in
 * `ENCRYPTED_FIELDS`): the secret goes to the connection test and no further,
 * and only the URL's host leaves, never its user info, path or query.
 *
 * @module lib/services/duplicate-audit
 */

import "server-only"

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { testService, type TESTABLE_SERVICES } from "@/lib/settings/test-service"

export const SERVICE_TABLES = ["PlexServer", "JellyfinServer", "Tautulli", "Overseerr", "Sonarr", "Radarr"] as const
export type ServiceTable = (typeof SERVICE_TABLES)[number]

const KIND: Record<ServiceTable, (typeof TESTABLE_SERVICES)[number]> = {
  PlexServer: "plex",
  JellyfinServer: "jellyfin",
  Tautulli: "tautulli",
  Overseerr: "overseerr",
  Sonarr: "sonarr",
  Radarr: "radarr",
}

/** An active row as the audit reads it; the secret fields stay inside this module. */
interface ActiveServiceRow {
  id: string
  url: string
  createdAt: Date
  updatedAt: Date
  token?: string
  apiKey?: string
}

/** The calls the audit and the apply make; structural, so each model's delegate (or a transaction's) fits. */
export interface ServiceTableDelegate {
  findMany(args: { where: { isActive: true }; orderBy: { updatedAt: "desc" } }): Promise<ActiveServiceRow[]>
  findFirst(args: { where: { isActive: true }; select: { id: true } }): Promise<{ id: string } | null>
  updateMany(args: { where: { id: { in: string[] } }; data: { isActive: false } }): Promise<{ count: number }>
}

export function tableDelegate(db: PrismaTransactionClient, table: ServiceTable): ServiceTableDelegate {
  const delegates: Record<ServiceTable, ServiceTableDelegate> = {
    PlexServer: db.plexServer,
    JellyfinServer: db.jellyfinServer,
    Tautulli: db.tautulli,
    Overseerr: db.overseerr,
    Sonarr: db.sonarr,
    Radarr: db.radarr,
  }
  return delegates[table]
}

/** `ok`, or why the row's saved values failed their test (a probe code, or the form check that refused them). */
type ConnectionResult = "ok" | "TIMEOUT" | "UNAUTHORIZED" | "NOT_FOUND" | "UNREACHABLE" | "SECRET_REQUIRED" | "VALIDATION"

interface AuditedRow {
  id: string
  host: string
  createdAt: string
  updatedAt: string
  connection: ConnectionResult
}

export interface DuplicateTable {
  table: ServiceTable
  /** Newest `updatedAt` first. */
  rows: AuditedRow[]
  todaysPickId: string
  orderedPickId: string
  suggestedKeepId: string
}

export type RowTester = (table: ServiceTable, row: ActiveServiceRow) => Promise<ConnectionResult>

/** Tests a row's saved values with the settings tester (P10.20), cut off at 5 s. @internal */
export const testSavedRow: RowTester = async (table, row) => {
  const result = await testService({ service: KIND[table], url: row.url, secret: row.token ?? row.apiKey })
  if (!result.ok) return result.code
  return result.probe.status === "ok" ? "ok" : result.probe.code
}

/** The URL's host and port, without user info, path or query. @internal */
export function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : "(not a URL)"
}

/** Every table with more than one active row, in {@link SERVICE_TABLES} order. */
export async function auditServiceRows({ test = testSavedRow }: { test?: RowTester } = {}): Promise<DuplicateTable[]> {
  const listed: DuplicateTable[] = []
  for (const table of SERVICE_TABLES) {
    const delegate = tableDelegate(prisma, table)
    const rows = await delegate.findMany({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })
    if (rows.length < 2) continue

    // The pre-P11.31 read, unordered on purpose: it is the row the app used until now
    // active-row-order: unordered
    const today = await delegate.findFirst({ where: { isActive: true }, select: { id: true } })
    const audited = await Promise.all(
      rows.map(async (row): Promise<AuditedRow> => ({
        id: row.id,
        host: hostOf(row.url),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        connection: await test(table, row),
      }))
    )
    const todaysPickId = today?.id ?? audited[0].id
    const todays = audited.find((row) => row.id === todaysPickId)
    const passing = audited.find((row) => row.connection === "ok")
    const suggestedKeepId = todays?.connection !== "ok" && passing ? passing.id : todaysPickId
    listed.push({ table, rows: audited, todaysPickId, orderedPickId: audited[0].id, suggestedKeepId })
  }
  return listed
}

/** The audit as printed lines: ids, hosts, dates and results only. */
export function formatServiceRowsAudit(tables: readonly DuplicateTable[]): string[] {
  if (tables.length === 0) return ["Every service has at most one active row. Nothing to apply."]
  const lines: string[] = []
  for (const entry of tables) {
    lines.push(`${entry.table}: ${entry.rows.length} active rows`)
    for (const row of entry.rows) {
      const marks = [
        row.id === entry.todaysPickId && "read today",
        row.id === entry.orderedPickId && "read after this release",
        row.id === entry.suggestedKeepId && "suggested keep",
      ].filter(Boolean)
      lines.push(`  ${row.id}  ${row.host}  updated ${row.updatedAt}  created ${row.createdAt}  connection ${row.connection}${marks.length ? `  (${marks.join(", ")})` : ""}`)
    }
  }
  lines.push(`Apply with: npm run services:rows-apply -- --dump <file> ${tables.map((t) => `--keep ${t.table}=${t.suggestedKeepId}`).join(" ")}`)
  return lines
}
