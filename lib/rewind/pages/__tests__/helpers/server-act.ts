/**
 * Builders for the server-act page tests (P7.2): a select context over a
 * fixture issue, facts rebuilt from changed stats, and the key paths of a
 * page's data for the privacy checks.
 */

import type { FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { SelectContext } from "@/lib/rewind/registry"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"
import { yearWindow } from "@/lib/wrapped/time/zone"

export function selectContext(issue: FixtureIssue, overrides: Partial<SelectContext> = {}): SelectContext {
  return { edition: "full", archetype: issue.archetype?.id ?? null, disabledPages: [], stats: issue.stats, ...overrides }
}

/** The facts a member with these stats gets, in en-US over 2026 in UTC. */
export function factsFor(stats: MemberStats): RewindFactsV3 {
  return buildFacts(stats, { member: { name: "Mike" }, window: { ...yearWindow(2026, "UTC"), year: 2026, finalCut: false }, archetype: null, locale: "en-US" })
}

/** Every key of a JSON value, nested keys included. */
export function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf)
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)])
  return []
}

/** Keys that would name a device, an address, an account or another member. */
export const FORBIDDEN_KEY = /player|ip|address|machine|email|user|member|name/i
