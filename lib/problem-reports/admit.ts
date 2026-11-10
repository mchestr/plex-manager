/**
 * The gate every member's report, follow and ask passes first: the switch
 * must be on, the member entitled (`full`), and each spends
 * `problem-report:create` (10 an hour) and `problem-report:create:day` (20 a
 * day) for the member. Cancel passes none of it (`./service.ts`).
 *
 * @module lib/problem-reports/admit
 */

import "server-only"

import { hasEntitlement } from "@/lib/actions/entitlement"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { consume } from "@/lib/security/rate-limit"

/** Why a report, follow or cancel was refused. */
export type ReportRefusal =
  | "OFF"
  | "NOT_ENTITLED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "NOTE_REQUIRED"
  | "WRONG_KIND"

export type Refused = { ok: false; refusal: ReportRefusal; retryAfterSec?: number }

const LIMITS = ["problem-report:create", "problem-report:create:day"] as const
export const refuse = (refusal: ReportRefusal): Refused => ({ ok: false, refusal })

/** The switch, entitlement and both rate limits, in that order. */
export async function admit(userId: string): Promise<Refused | null> {
  if (!(await getProblemReportSettings()).enabled) return refuse("OFF")
  if (!(await hasEntitlement(userId, "full"))) return refuse("NOT_ENTITLED")
  for (const name of LIMITS) {
    const spent = await consume(name, userId)
    if (!spent.ok) return { ok: false, refusal: "RATE_LIMITED", retryAfterSec: spent.retryAfterSec }
  }
  return null
}
