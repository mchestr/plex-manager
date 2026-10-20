/**
 * From stats to an issue (design 9.2 steps 4 to 6): the archetype, the facts
 * and their hash, the edition and the pages. Pure.
 *
 * The archetype is code's pick (`selectArchetype`, rarity from the
 * aggregate). When the model chooses another archetype from the shortlist
 * (allowed only when `llmMayChoose`), {@link withArchetype} rebuilds the
 * facts around that choice so every page, card and token agrees with it.
 *
 * @module lib/wrapped/pipeline/build-issue
 */

import type { ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import { MIN_SCORED_MEMBERS } from "@/lib/wrapped/aggregate/schema"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { scoreArchetypes } from "@/lib/wrapped/archetypes/scorers"
import { selectArchetype, type ArchetypeCounts, type ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import { buildFacts, type BuildFactsInput } from "@/lib/wrapped/facts/build-facts"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { factsHash } from "@/lib/wrapped/facts/hash"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

import { editionOf, omittedPages, selectIssuePages, type Edition, type IssuePage } from "./edition"

export interface IssueInput {
  userId: string
  year: number
  stats: MemberStats
  member: BuildFactsInput["member"]
  window: BuildFactsInput["window"]
  locale: string
  counts: ArchetypeCounts | null
  medians: ServerAggregate["medians"]
  disabledPages: readonly string[]
}

export interface Issue {
  archetype: ArchetypeSelection | null
  facts: RewindFactsV3
  factsHash: string
  edition: Edition
  omitted: number[]
  pages: IssuePage[]
}

function factsFor(input: IssueInput, archetype: ArchetypeSelection | null): RewindFactsV3 {
  return buildFacts(input.stats, {
    member: input.member,
    window: input.window,
    archetype,
    medians: input.medians ?? undefined,
    locale: input.locale,
  })
}

function pagesFor(input: IssueInput, edition: Edition, facts: RewindFactsV3, archetype: ArchetypeSelection | null) {
  return selectIssuePages(edition, facts, { stats: input.stats, userId: input.userId, archetype: archetype?.id ?? null, disabledPages: input.disabledPages })
}

/** Builds the issue from the member's stats. */
export function buildIssue(input: IssueInput): Issue {
  const archetype = selectArchetype(input.stats, { userId: input.userId, year: input.year, counts: input.counts })
  const facts = factsFor(input, archetype)
  const omitted = omittedPages(facts, input.stats, archetype?.id ?? null)
  const edition = editionOf(input.stats, omitted)
  return { archetype, facts, factsHash: factsHash(facts), edition, omitted, pages: pagesFor(input, edition, facts, archetype) }
}

/**
 * The issue with the model's archetype in place of code's: its evidence and
 * rarity, code's pick as the runner-up, and the facts rebuilt.
 */
export function withArchetype(issue: Issue, input: IssueInput, id: ArchetypeId): Issue {
  if (!issue.archetype || issue.archetype.id === id) return issue
  const counts = input.counts
  const archetype: ArchetypeSelection = {
    ...issue.archetype,
    id,
    runnerUp: issue.archetype.id,
    evidence: scoreArchetypes(input.stats)[id].evidence,
    rarity: issue.archetype.rarity && counts?.archetypeCounts ? { count: counts.archetypeCounts[id] ?? 0, of: issue.archetype.rarity.of } : null,
  }
  const facts = factsFor(input, archetype)
  return { ...issue, archetype, facts, factsHash: factsHash(facts), pages: pagesFor(input, issue.edition, facts, archetype) }
}

/**
 * True when the aggregate counted nobody under the member's archetype
 * although it scored enough members: the member's pick and the server's
 * count disagree (P2.9's release-date risk), which the pipeline logs.
 */
export function disagreesWithAggregate(archetype: ArchetypeSelection | null, counts: ArchetypeCounts | null): boolean {
  if (!archetype || !counts?.archetypeCounts || counts.scoredMembers < MIN_SCORED_MEMBERS) return false
  return (counts.archetypeCounts[archetype.id] ?? 0) === 0
}
