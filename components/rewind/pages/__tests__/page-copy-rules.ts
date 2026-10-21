/**
 * The copy rules P7.1's page tests share (RWV-11): the fixtures they run on,
 * and checks that no page prints a zero count or a singular count with a
 * plural word.
 */

import { fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { IssuePageType, SelectContext } from "@/lib/rewind/registry"
import { registry } from "@/lib/rewind/registry"

export const PAGE_FIXTURES = ["heavy", "median", "light", "long-and-non-latin-titles"] as const

export async function loadIssues(): Promise<Map<string, FixtureIssue>> {
  const issues = new Map<string, FixtureIssue>()
  for (const id of PAGE_FIXTURES) issues.set(id, await fixtureIssue(id))
  return issues
}

const ctxOf = (issue: FixtureIssue): SelectContext => ({ edition: "full", archetype: issue.archetype?.id ?? null, disabledPages: [], stats: issue.stats })

/** The page's data for a fixture, whatever its edition, or null when the page omits itself. */
export function pageData<D>(issue: FixtureIssue, type: IssuePageType): D | null {
  return registry[type].select(issue.facts, ctxOf(issue)) as D | null
}

const PLURALS = /(^|[^\d.,:])1 (films|episodes|titles|minutes|hours|days|months|plays|genres|members)\b/
const ZERO = /(^|[^\d.,:])0 [A-Za-z]/

/** Text with every no-break space as a space. */
export const plainText = (text: string) => text.replace(/[  ]/g, " ")

/** No "0 films" and no "1 films" anywhere in `text`. */
export function hasCleanCounts(text: string): boolean {
  const plain = plainText(text)
  return !ZERO.test(plain) && !PLURALS.test(plain)
}
