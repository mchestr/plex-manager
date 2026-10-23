/**
 * The admin Privacy section's read (P11.14): the retention windows and the
 * last recorded sweep. Server-only and admin-checked.
 *
 * @module lib/data/retention
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { RETENTION_RULES, retentionPolicy, type RetentionPolicyRow, type RetentionRule } from "@/lib/retention/policy"

export interface RetentionStatus {
  policy: RetentionPolicyRow[]
  /** The last complete sweep, or null before the first. */
  lastRun: { at: string; counts: Partial<Record<RetentionRule, number>> } | null
}

const countsSchema = z.record(z.string(), z.number().int().nonnegative())

/** Keeps the counts of the rules this build knows; stored JSON is checked, never trusted. @internal */
export function parseRetentionSummary(summary: unknown): Partial<Record<RetentionRule, number>> {
  const parsed = countsSchema.safeParse(summary)
  if (!parsed.success) return {}
  return Object.fromEntries(RETENTION_RULES.filter((rule) => rule in parsed.data).map((rule) => [rule, parsed.data[rule]]))
}

/** The windows and the last run (admin only). */
export async function getRetentionStatus(): Promise<RetentionStatus> {
  await assertAdmin()
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { lastRetentionRunAt: true, lastRetentionSummary: true },
  })
  return {
    policy: retentionPolicy(),
    lastRun: config?.lastRetentionRunAt
      ? { at: config.lastRetentionRunAt.toISOString(), counts: parseRetentionSummary(config.lastRetentionSummary) }
      : null,
  }
}
