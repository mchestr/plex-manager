#!/usr/bin/env tsx
/**
 * Roll every final cut of a year back to the season issue (P8.5).
 *
 * A dry run unless --apply is passed, like P0.20's script. For each member
 * whose latest completed generation of the year is a `final-cut` one, --apply
 * runs P7.9's roll back (`rollbackStoredRewind`): one audited transaction
 * that restores the data the final cut replaced, under the member's
 * generation lock, skipping a member whose run is queued or running. The roll
 * back's own generation is an `admin` one, so a second --apply changes
 * nothing.
 *
 * Usage (from a checkout; needs DATABASE_URL and REDIS_URL):
 *   npm run rewind:rollback-final-cut -- --year=2026
 *   npm run rewind:rollback-final-cut -- --year=2026 --admin=<admin user id> --apply
 */

import "dotenv/config"

import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { getRedisConnection } from "@/lib/queue/connection"
import { acquireGenerationLock } from "@/lib/queue/redis-lock"
import { hasActiveGeneration } from "@/lib/rewind/generation-guards"
import { rollbackStoredRewind } from "@/lib/rewind/rollback"
import { yearSchema } from "@/lib/validations/shared-schemas"

const USAGE = "Usage: npm run rewind:rollback-final-cut -- --year=<year> [--admin=<admin user id> --apply]"

export type RollbackArgs =
  | { ok: true; year: number; apply: boolean; adminId: string | null }
  | { ok: false; help: boolean; error?: string }

/** `--year` is required; `--apply` needs the `--admin` the audit entries name. */
export function parseRollbackArgs(argv: readonly string[]): RollbackArgs {
  let values
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        year: { type: "string" },
        admin: { type: "string" },
        apply: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }).values
  } catch (error) {
    return { ok: false, help: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (values.help) return { ok: false, help: true }
  const year = yearSchema.safeParse(Number(values.year))
  if (!year.success) return { ok: false, help: false, error: "--year must be a year, such as --year=2026." }
  if (values.apply && !values.admin) return { ok: false, help: false, error: "--apply needs --admin=<admin user id> for the audit log." }
  return { ok: true, year: year.data, apply: values.apply, adminId: values.admin ?? null }
}

export type RollbackOutcome = "rolled-back" | "active" | "no-previous" | "unreadable"

export interface RollbackDeps {
  /** Members whose latest completed generation of the year is `final-cut`. */
  findFinalCuts: (year: number) => Promise<string[]>
  isAdmin: (userId: string) => Promise<boolean>
  rollback: (userId: string, year: number, adminId: string) => Promise<RollbackOutcome>
  print?: (line: string) => void
}

/** Runs the roll back; returns the exit code (0 done, 1 refused, 2 bad arguments). */
export async function main(argv: readonly string[], deps: RollbackDeps): Promise<number> {
  const print = deps.print ?? console.log
  const args = parseRollbackArgs(argv)
  if (!args.ok) {
    if (args.error) print(args.error)
    print(USAGE)
    return args.help ? 0 : 2
  }
  const members = await deps.findFinalCuts(args.year)
  if (!args.apply) {
    print(`Dry run: ${members.length} final cut${members.length === 1 ? "" : "s"} of ${args.year} would roll back to the season issue. Pass --apply to roll back.`)
    return 0
  }
  if (!(await deps.isAdmin(args.adminId!))) {
    print("Refusing: --admin is not an admin.")
    return 1
  }
  const counts: Record<RollbackOutcome, number> = { "rolled-back": 0, active: 0, "no-previous": 0, unreadable: 0 }
  for (const userId of members) counts[await deps.rollback(userId, args.year, args.adminId!)]++
  print(
    `Rolled back ${counts["rolled-back"]} of ${members.length}; skipped ${counts.active} generating, ${counts["no-previous"]} without a season issue, ${counts.unreadable} unreadable.`
  )
  return 0
}

/** Members whose latest completed generation of `year` is a final cut. */
async function findFinalCuts(year: number): Promise<string[]> {
  const latest = await prisma.rewindGeneration.findMany({
    where: { year, status: "completed" },
    distinct: ["userId"],
    orderBy: [{ userId: "asc" }, { finishedAt: "desc" }, { createdAt: "desc" }],
    select: { userId: true, kind: true },
  })
  return latest.filter((row) => row.kind === "final-cut").map((row) => row.userId)
}

/** P7.9's roll back of one member, under their generation lock. */
async function rollbackOne(userId: string, year: number, adminId: string): Promise<RollbackOutcome> {
  if (await hasActiveGeneration(userId, year)) return "active"
  const lock = await acquireGenerationLock(getRedisConnection(), { year, userId, owner: `rollback:${randomUUID()}` })
  if (!lock) return "active"
  try {
    if (await hasActiveGeneration(userId, year)) return "active"
    const result = await rollbackStoredRewind({ userId, year, adminId })
    if (result.ok) return "rolled-back"
    return result.reason === "NO_PREVIOUS" ? "no-previous" : "unreadable"
  } finally {
    await lock.release()
  }
}

if (require.main === module) {
  main(process.argv.slice(2), {
    findFinalCuts,
    isAdmin: async (userId) => (await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }))?.isAdmin === true,
    rollback: rollbackOne,
  })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("The final-cut roll back failed:", error)
      process.exitCode = 1
    })
    // The lock's Redis connection would keep the process alive.
    .finally(() => prisma.$disconnect().finally(() => process.exit()))
}
