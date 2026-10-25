#!/usr/bin/env tsx
/**
 * List the services with more than one active row (P11.31). A dry run: it
 * writes nothing, and prints ids, URL hosts, dates and connection results,
 * never a key or token.
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   DATABASE_URL=... ENCRYPTION_KEYS=... npm run services:rows-audit
 *
 * Each listed row shows which one the app reads today ("read today"), which
 * one this release's ordered reads pick, and the suggested keep. The last
 * line is the `services:rows-apply` command with the suggested keeps; check
 * each keep before running it.
 */

import "dotenv/config"

import { prisma } from "@/lib/prisma"
import { auditServiceRows, formatServiceRowsAudit } from "@/lib/services/duplicate-audit"

async function main() {
  for (const line of formatServiceRowsAudit(await auditServiceRows())) console.log(line)
}

main()
  .catch((error: unknown) => {
    console.error("The service rows audit failed:", error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
