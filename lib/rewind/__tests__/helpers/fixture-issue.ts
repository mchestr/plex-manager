/**
 * A golden fixture (P2.10) as an issue: the member's stats, facts, archetype
 * and selected pages, the way P5.9's pipeline will build them, plus the
 * render context the page components take.
 */

import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { FIXTURE_USER_ID } from "@/evals/rewind/__tests__/stats-inputs"
import { editionOf, omittedPages } from "@/evals/rewind/__tests__/pages"
import type { Edition } from "@/lib/rewind/registry"
import { selectPages, type SelectedPage } from "@/lib/rewind/select-pages"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

export interface FixtureIssue {
  id: string
  facts: RewindFactsV3
  stats: MemberStats
  archetype: ReturnType<typeof selectArchetype>
  edition: Edition
  pages: SelectedPage[]
}

const fixtures = loadFixtures()

export const FIXTURE_IDS = fixtures.map((f) => f.id)

export async function fixtureIssue(id: string, opts: { nthRewind?: number; serial?: string } = {}): Promise<FixtureIssue> {
  const fixture = fixtures.find((f) => f.id === id)!
  const member = await fixtureMember(fixture)
  const archetype = selectArchetype(member.stats, { userId: FIXTURE_USER_ID, year: fixture.window.year, counts: null })
  const facts = buildFacts(member.stats, {
    member: { name: fixture.member.userName ?? fixture.member.displayName, ...opts },
    window: { ...member.ctx.window, year: fixture.window.year, finalCut: fixture.window.finalCut },
    archetype,
    locale: "en-US",
  })
  const edition = editionOf(member.stats, omittedPages(facts, member.stats, archetype?.id ?? null))
  const pages = selectPages(facts, { edition, archetype: archetype?.id ?? null, disabledPages: [], stats: member.stats })
  return { id, facts, stats: member.stats, archetype, edition, pages }
}

export function issueContext(issue: FixtureIssue, overrides: Partial<IssueContext> = {}): IssueContext {
  return {
    year: 2026,
    userId: FIXTURE_USER_ID,
    locale: "en-US",
    serverName: "Chester Family Plex",
    edition: issue.edition,
    pages: issue.pages,
    copy: null,
    copySource: "template",
    model: null,
    returnTo: "/",
    zone: "server",
    facts: issue.facts,
    ...overrides,
  }
}
