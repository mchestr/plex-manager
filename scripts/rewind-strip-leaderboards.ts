#!/usr/bin/env tsx
/**
 * Strip stored rosters, Rewind LLM text and legacy share visits (P0.20).
 *
 * A dry run unless --apply is passed. It prints the target database (password
 * masked), then scanned and changed counts for each step of
 * `lib/wrapped/maintenance/strip-rosters.ts`. A second --apply changes nothing.
 *
 * Usage (from a checkout or the Dockerfile `dev` target; the runtime image has
 * no scripts/ and no tsx):
 *   DATABASE_URL=postgresql://... npm run rewind:strip-leaderboards -- --opt-in-since=2026-10-22T18:00:00Z
 *   DATABASE_URL=postgresql://... npm run rewind:strip-leaderboards -- --apply --opt-in-since=2026-10-22T18:00:00Z
 *
 * --opt-in-since is when the release with P0.19 went live, with a Z or an
 * offset, and not in the future. A share link on a Rewind written since then
 * was turned on by its member (or the Rewind was regenerated) and is kept.
 * --apply refuses to run without it; a dry run without it counts every
 * unvisited token.
 *
 * Operator path:
 * - Deploy the release with P0.8, P0.19 and P0.20 first. Older code keeps
 *   writing rosters, legacy visits and tokens, and --apply refuses to run until
 *   migration 20261021000000_llmusage_text_nullable has made LLMUsage.prompt
 *   and response nullable.
 * - Run two dry runs a few minutes apart. The changed counts must match
 *   (scanned visits grow as people open links).
 * - Run --apply soon after the release, before admins regenerate Rewinds:
 *   nothing records which tokens a member turned on, so an auto-minted token
 *   on a Rewind written after --opt-in-since (an admin regeneration, a retry
 *   of a failed row, a playground save) is kept. Before --apply, list them
 *   (SELECT id, "userId", year, "updatedAt" FROM "PlexWrapped" WHERE
 *   "shareToken" IS NOT NULL AND "updatedAt" >= '<opt-in-since>' AND NOT EXISTS
 *   (SELECT 1 FROM "WrappedShareVisit" v WHERE v."wrappedId" = "PlexWrapped".id))
 *   and compare them with the SHARE_LINK_CREATED audit lines in the server
 *   logs; null any token without one by hand.
 * - Take an encrypted dump (it holds the rosters being purged), run --apply,
 *   then a dry run that shows zeros.
 *
 * Legacy visits are kept with their IP hash, user agent and referer cleared,
 * so the admin share analytics keep their visit counts.
 *
 * Rolling back: after --apply, an app image older than this release reads the
 * nulled LLMUsage text as strings and its admin LLM pages fail. Before rolling
 * back, run
 *   UPDATE "LLMUsage" SET prompt = COALESCE(prompt, ''), response = COALESCE(response, '');
 * and, to restore the old constraint as well,
 *   ALTER TABLE "LLMUsage" ALTER COLUMN "prompt" SET NOT NULL, ALTER COLUMN "response" SET NOT NULL;
 * The removed text itself survives only in the dump.
 */

import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
import { z } from "zod"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { maskDatabaseUrl } from "@/lib/security/test-mode"
import {
  type StepCounts,
  stripRosters,
  type StripRostersOptions,
  type StripRostersReport,
} from "@/lib/wrapped/maintenance/strip-rosters"

const USAGE =
  "Usage: npm run rewind:strip-leaderboards -- [--apply] --opt-in-since=<ISO time the P0.19 release went live>"
const OPT_IN_SINCE = "--opt-in-since="
const MIGRATION = "20261021000000_llmusage_text_nullable"

const isoTimeSchema = z.iso.datetime({ offset: true })

export type StripArgs = { ok: true; options: StripRostersOptions } | { ok: false; help: boolean; error?: string }

/**
 * `--apply` writes and needs `--opt-in-since=<ISO time>`; a dry run takes it
 * optionally. `--help` prints the usage, and anything else is refused.
 */
export function parseStripArgs(argv: readonly string[], now: Date): StripArgs {
  if (argv.includes("--help") || argv.includes("-h")) return { ok: false, help: true }
  let apply = false
  let optInSince: Date | null = null
  for (const arg of argv) {
    if (arg === "--apply" && !apply) {
      apply = true
    } else if (arg.startsWith(OPT_IN_SINCE) && optInSince === null) {
      const parsed = isoTimeSchema.safeParse(arg.slice(OPT_IN_SINCE.length))
      if (!parsed.success) {
        return { ok: false, help: false, error: "--opt-in-since must be an ISO time with Z or an offset." }
      }
      optInSince = new Date(parsed.data)
      if (optInSince > now) return { ok: false, help: false, error: "--opt-in-since is in the future." }
    } else {
      return { ok: false, help: false, error: `Unknown or repeated argument: ${arg}` }
    }
  }
  if (!apply) return { ok: true, options: { apply: false, optInSince } }
  if (optInSince === null) return { ok: false, help: false, error: "--apply needs --opt-in-since." }
  return { ok: true, options: { apply: true, optInSince } }
}

/** The lines printed before anything runs: the mode, the masked target and the cutoff. */
export function formatStripHeader(options: StripRostersOptions, databaseUrl: string): string[] {
  const target = maskDatabaseUrl(databaseUrl)
  return [
    options.apply
      ? `Rewind roster clean-up: applying to ${target}.`
      : `Rewind roster clean-up: dry run against ${target}, nothing is written (pass --apply to write).`,
    options.optInSince === null
      ? "Opt-in since: not set, so step 4 counts every unvisited token (--apply needs --opt-in-since)."
      : `Opt-in since ${options.optInSince.toISOString()}: share links on Rewinds written since then are kept.`,
  ]
}

/** The scanned and changed counts of each step, as printed. */
export function formatStripCounts(report: StripRostersReport): string[] {
  const step = (label: string, counts: StepCounts, extra = "") =>
    `${label.padEnd(18)} scanned ${counts.scanned}, changed ${counts.changed}${extra}`
  const { storedData } = report
  return [
    step(
      "1. Stored data",
      storedData,
      `, unparsable ${storedData.unparsable}` + (report.apply ? `, skipped ${storedData.skipped}` : "")
    ),
    step("2. LLM text", report.llmText),
    step("3. Errors", report.errors),
    step("4. Share tokens", report.tokens),
    step("5. Legacy visits", report.visits),
  ]
}

/** True when migration {@link MIGRATION} has made `LLMUsage.prompt` and `response` nullable. */
async function llmTextIsNullable(db: PrismaClient): Promise<boolean> {
  // information_schema has no Prisma model, so this read-only check is the one raw query.
  const columns = await db.$queryRaw<{ column_name: string; is_nullable: string }[]>`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'LLMUsage' AND column_name IN ('prompt', 'response')`
  return columns.length === 2 && columns.every((column) => column.is_nullable === "YES")
}

export interface MainContext {
  db: PrismaClient
  /** Printed with its password masked; `db` must connect to it. */
  databaseUrl: string
  print?: (line: string) => void
  now?: Date
}

/**
 * Run the clean-up against `db` and print the report.
 *
 * @returns The process exit code: 0 on success, 1 when --apply finds the
 *   migration missing (nothing is written), 2 for bad arguments.
 */
export async function main(
  argv: readonly string[],
  { db, databaseUrl, print = console.log, now = new Date() }: MainContext
): Promise<number> {
  const args = parseStripArgs(argv, now)
  if (!args.ok) {
    if (args.error) print(args.error)
    print(USAGE)
    return args.help ? 0 : 2
  }
  const { options } = args
  formatStripHeader(options, databaseUrl).forEach((line) => print(line))

  if (!(await llmTextIsNullable(db))) {
    const missing = `LLMUsage.prompt and response are still NOT NULL: deploy migration ${MIGRATION} first.`
    if (options.apply) {
      print(`Refusing to apply. ${missing}`)
      return 1
    }
    print(`Warning: ${missing} --apply will refuse until then.`)
  }

  const report = await stripRosters(db, options)
  formatStripCounts(report).forEach((line) => print(line))
  return 0
}

if (require.main === module) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  main(process.argv.slice(2), { db, databaseUrl })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("Rewind roster clean-up failed:", error)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
