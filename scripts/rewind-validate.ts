#!/usr/bin/env tsx
/**
 * Validate every stored Rewind of a year, read-only (P8.5).
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   DATABASE_URL=postgresql://... npm run rewind:validate -- --year=2026
 *   DATABASE_URL=postgresql://... npm run rewind:validate -- --year=2026 --final-cut
 *
 * It reads each eligible member's (enabled, with a Plex identity) Rewind row
 * and latest generation, and every live share link of the year, and runs
 * `lib/wrapped/maintenance/validate-year.ts`. It prints counts by failure
 * code and skipped members by reason, never a title or a name, and exits 1
 * when anything fails. It writes nothing.
 */

import "dotenv/config"

import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { ShareOptions } from "@/lib/wrapped/data/share-safe-schema"
import {
  formatYearReport,
  validateYear,
  type MemberRow,
  type ShareRow,
  type ValidateOptions,
  type YearReport,
} from "@/lib/wrapped/maintenance/validate-year"

const USAGE = "Usage: npm run rewind:validate -- --year=<year> [--final-cut]"

export type ValidateArgs = { ok: true; options: ValidateOptions } | { ok: false; help: boolean; error?: string }

/** `--year=<year>` is required; `--final-cut` adds the final-cut checks. */
export function parseValidateArgs(argv: readonly string[]): ValidateArgs {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { year: { type: "string" }, "final-cut": { type: "boolean", default: false }, help: { type: "boolean", short: "h", default: false } },
      strict: true,
    })
    if (values.help) return { ok: false, help: true }
    const year = yearSchema.safeParse(Number(values.year))
    if (!year.success) return { ok: false, help: false, error: "--year must be a year, such as --year=2026." }
    return { ok: true, options: { year: year.data, finalCut: values["final-cut"] } }
  } catch (error) {
    return { ok: false, help: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Each eligible member with their Rewind row and latest generation. */
export async function loadMemberRows(year: number): Promise<MemberRow[]> {
  const users = await prisma.user.findMany({
    where: { disabledAt: null, plexUserId: { not: null } },
    select: {
      id: true,
      plexWrapped: { where: { year }, select: { id: true, status: true, data: true, finalCutAt: true } },
      rewindGenerations: { where: { year }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, error: true } },
    },
  })
  return users.map((user) => {
    const latest = user.rewindGenerations[0]
    const error = latest?.error as { code?: unknown } | null | undefined
    return {
      userId: user.id,
      wrapped: user.plexWrapped[0] ?? null,
      latest: latest ? { status: latest.status, code: typeof error?.code === "string" ? error.code : null } : null,
    }
  })
}

/** Every live share link of the year, projected as its page would project it. */
export async function loadShareRows(year: number, now: Date = new Date()): Promise<ShareRow[]> {
  const shares = await prisma.rewindShare.findMany({
    where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], wrapped: { year, status: "completed" } },
    select: {
      id: true,
      pages: true,
      signed: true,
      includeArt: true,
      dailyDetail: true,
      cardFacts: true,
      wrapped: { select: { id: true, userId: true, year: true, data: true } },
    },
  })
  const rows: ShareRow[] = []
  for (const share of shares) {
    const ctx = await loadShareContext({ userId: share.wrapped.userId, year: share.wrapped.year })
    rows.push({
      shareId: share.id,
      wrappedId: share.wrapped.id,
      project: () => {
        const stored = parseStoredRewind(share.wrapped.data)
        if (stored.version !== 3) throw new Error("not a v3 Rewind")
        const options = ShareOptions.parse({
          pages: share.pages,
          signed: share.signed,
          includeArt: share.includeArt,
          dailyDetail: share.dailyDetail,
          cardFacts: share.cardFacts,
        })
        return toShareSafe(stored.data, options, ctx)
      },
    })
  }
  return rows
}

export interface ValidateDeps {
  loadMembers: (year: number) => Promise<MemberRow[]>
  loadShares: (year: number) => Promise<ShareRow[]>
  print?: (line: string) => void
}

/** Runs the validator; returns the exit code (0 clean, 1 failures, 2 bad arguments) and the report. */
export async function main(argv: readonly string[], deps: ValidateDeps): Promise<{ code: number; report: YearReport | null }> {
  const print = deps.print ?? console.log
  const args = parseValidateArgs(argv)
  if (!args.ok) {
    if (args.error) print(args.error)
    print(USAGE)
    return { code: args.help ? 0 : 2, report: null }
  }
  const { options } = args
  const [members, shares] = await Promise.all([deps.loadMembers(options.year), deps.loadShares(options.year)])
  const report = validateYear(members, shares, options)
  formatYearReport(report, options).forEach((line) => print(line))
  return { code: report.failing.length === 0 ? 0 : 1, report }
}

if (require.main === module) {
  main(process.argv.slice(2), { loadMembers: loadMemberRows, loadShares: loadShareRows })
    .then(({ code }) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("Rewind validation failed to run:", error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
