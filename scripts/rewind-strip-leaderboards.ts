#!/usr/bin/env tsx
/**
 * Strip stored rosters, Rewind LLM text and legacy share visits (P0.20).
 *
 * A dry run unless --apply is passed. It prints scanned and changed counts for
 * each step of `lib/wrapped/maintenance/strip-rosters.ts`, and a second
 * --apply run reports zeros.
 *
 * Usage (from a checkout or the Dockerfile `dev` target; the runtime image has
 * no scripts/ and no tsx):
 *   DATABASE_URL=postgresql://... npm run rewind:strip-leaderboards
 *   DATABASE_URL=postgresql://... npm run rewind:strip-leaderboards -- --apply
 *
 * Run it only after the release with P0.8 and P0.19 is deployed: older code
 * keeps writing rosters, legacy visits and tokens. Check that two dry runs a
 * few minutes apart give the same counts, take an encrypted dump (it holds the
 * rosters being purged), run --apply, then run once more to see zeros.
 */

import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { formatStripReport, parseStripArgs, stripRosters } from "@/lib/wrapped/maintenance/strip-rosters"

const USAGE = "Usage: npm run rewind:strip-leaderboards [-- --apply]"

/**
 * Run the clean-up against `db` and print the report.
 *
 * @returns The process exit code: 0 on success, 2 for bad arguments.
 */
export async function main(
  argv: readonly string[],
  db: PrismaClient,
  print: (line: string) => void = console.log
): Promise<number> {
  const args = parseStripArgs(argv)
  if (!args.ok) {
    print(USAGE)
    return args.help ? 0 : 2
  }
  const report = await stripRosters(db, { apply: args.apply })
  formatStripReport(report).forEach((line) => print(line))
  return 0
}

if (require.main === module) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  main(process.argv.slice(2), db)
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("Rewind roster clean-up failed:", error)
      process.exitCode = 1
    })
    .finally(() => db.$disconnect())
}
