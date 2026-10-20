/**
 * The twenty golden fixtures as copy sees them: each member's facts (en-US,
 * as P2.16's goldens build them) and the pages their issue selects. The page
 * rules are P2.16's `evals/rewind/__tests__/pages.ts` until P5.5's registry
 * `select()` replaces them.
 */

import { issuePages } from "@/lib/rewind/registry"
import { selectArchetype, type ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import type { PageType } from "@/lib/wrapped/data/page-types"
import { buildFacts } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureMember } from "@/evals/rewind/__tests__/member-stats"
import { editionOf, omittedPages } from "@/evals/rewind/__tests__/pages"
import { FIXTURE_USER_ID } from "@/evals/rewind/__tests__/stats-inputs"

export interface FixtureCopyInput {
  id: string
  year: number
  facts: RewindFactsV3
  archetype: ArchetypeSelection | null
  edition: "full" | "pocket" | "postcard"
  selected: PageType[]
}

export async function fixtureCopyInputs(): Promise<FixtureCopyInput[]> {
  return Promise.all(
    loadFixtures().map(async (fixture) => {
      const member = await fixtureMember(fixture)
      const archetype = selectArchetype(member.stats, { userId: FIXTURE_USER_ID, year: fixture.window.year, counts: null })
      const facts = buildFacts(member.stats, {
        member: { name: fixture.member.userName ?? fixture.member.displayName },
        window: { ...member.ctx.window, year: fixture.window.year, finalCut: fixture.window.finalCut },
        archetype,
        locale: "en-US",
      })
      const omitted = omittedPages(facts, member.stats, archetype?.id ?? null)
      const edition = editionOf(member.stats, omitted)
      const selected = edition === "postcard" ? [] : issuePages.map((p) => p.type).filter((_, i) => !omitted.includes(i + 1))
      return { id: fixture.id, year: fixture.window.year, facts, archetype, edition, selected }
    })
  )
}
