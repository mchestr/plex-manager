#!/usr/bin/env tsx
/**
 * Leave one active row per service (P11.31): keep the named row of each
 * table and deactivate the others, in one transaction, audited as
 * `SERVICE_ROWS_DEDUPED` with the deactivated ids.
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   npm run services:rows-audit
 *   pg_dump -Fc "$DATABASE_URL" -f plex-manager-$(date +%F-%H%M).dump   # then encrypt it (docs/operations.md)
 *   npm run services:rows-apply -- --dump plex-manager-….dump.age --keep Tautulli=<id> [--keep <Table>=<id> ...]
 *
 * It refuses without `--dump` naming a non-empty file written in the last
 * six hours, and without a `--keep` for every table the audit lists. A
 * second run with the same keeps finds nothing to do.
 */

import "dotenv/config"

import { statSync } from "node:fs"
import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { applyServiceRowKeeps, type ApplyServiceRowsResult, type ServiceRowKeeps } from "@/lib/services/duplicate-apply"
import { SERVICE_TABLES, type ServiceTable } from "@/lib/services/duplicate-audit"

const USAGE = "Usage: npm run services:rows-apply -- --dump <file> --keep <Table>=<id> [--keep <Table>=<id> ...]"
const DUMP_MAX_AGE_MS = 6 * 60 * 60 * 1000
const ACTOR = "script:service-rows-apply"

export type ParsedApplyArgs = { ok: true; dump: string; keeps: ServiceRowKeeps } | { ok: false; error: string }

/** `--dump` once and `--keep <Table>=<id>` per table, each table at most once. */
export function parseApplyArgs(argv: readonly string[]): ParsedApplyArgs {
  let values
  try {
    values = parseArgs({ args: [...argv], options: { dump: { type: "string" }, keep: { type: "string", multiple: true } }, strict: true }).values
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (!values.dump) return { ok: false, error: "--dump is required: take a pg_dump first and name the file." }
  const keeps: ServiceRowKeeps = {}
  for (const pair of values.keep ?? []) {
    const [table, id, ...rest] = pair.split("=")
    if (!(SERVICE_TABLES as readonly string[]).includes(table) || !id || rest.length > 0) {
      return { ok: false, error: `--keep ${pair} must be <Table>=<id>, with a table in ${SERVICE_TABLES.join(", ")}.` }
    }
    if (keeps[table as ServiceTable]) return { ok: false, error: `--keep names ${table} twice.` }
    keeps[table as ServiceTable] = id
  }
  return { ok: true, dump: values.dump, keeps }
}

export interface ApplyDeps {
  apply: typeof applyServiceRowKeeps
  /** The dump file's size and modified time, or null when it is missing. */
  statDump: (path: string) => { size: number; mtimeMs: number } | null
  now?: () => number
  print?: (line: string) => void
}

function summary(result: Extract<ApplyServiceRowsResult, { ok: true }>): string[] {
  const tables = Object.keys(result.deactivated) as ServiceTable[]
  if (tables.length === 0) return ["Every service already has at most one active row. Nothing changed."]
  return tables.map((table) => `${table}: kept ${result.kept[table]}, deactivated ${result.deactivated[table]?.join(", ")}`)
}

/** Runs the apply; returns the exit code (0 done or nothing to do, 1 refused, 2 bad arguments). */
export async function main(argv: readonly string[], deps: ApplyDeps): Promise<number> {
  const print = deps.print ?? console.log
  const args = parseApplyArgs(argv)
  if (!args.ok) {
    print(args.error)
    print(USAGE)
    return 2
  }
  const dump = deps.statDump(args.dump)
  const now = deps.now?.() ?? Date.now()
  if (!dump || dump.size === 0 || now - dump.mtimeMs > DUMP_MAX_AGE_MS) {
    print(`Refused: ${args.dump} is not a dump taken in the last six hours. Take one first (docs/operations.md, "Backup").`)
    return 1
  }

  const result = await deps.apply({ keeps: args.keeps, actor: ACTOR, dump: args.dump })
  if (!result.ok) {
    print(
      result.code === "KEEP_MISSING"
        ? `Refused: these tables have more than one active row and no --keep: ${result.tables.join(", ")}. Run services:rows-audit.`
        : `Refused: these --keep ids are not active rows of their table: ${result.tables.join(", ")}. Run services:rows-audit again.`
    )
    return 1
  }
  for (const line of summary(result)) print(line)
  return 0
}

if (require.main === module) {
  const statDump = (path: string) => {
    try {
      return statSync(path)
    } catch {
      return null
    }
  }
  main(process.argv.slice(2), { apply: applyServiceRowKeeps, statDump })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("The service rows apply failed:", error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
