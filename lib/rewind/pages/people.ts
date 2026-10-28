/**
 * 08 People (design 4.3): who was on screen most, as a poster billing
 * block of names only (no headshots). The No. 1 actor is a nameplate, the
 * rest of the cast and the directors (films only) follow in capitals with
 * italic connectors.
 *
 * Omitted below 70% cast or director coverage of the listed minutes (P2.8's
 * `people.eligible`). People is first on the cut list:
 * `rewindDisabledPages: ['people']` removes it without a deploy.
 *
 * @module lib/rewind/pages/people
 */

import { andList, deckBlock, heading, plain } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { shown } from "./facts"
import { PeopleDataSchema, type PeopleData } from "./people.schema"

const actorFact = (i: number) => `people.actor[${i + 1}].name` as FactId
const directorFact = (i: number) => `people.director[${i + 1}].name` as FactId
/** Every name the billing can print. */
const PEOPLE_FACTS = [0, 1, 2, 3, 4].map(actorFact).concat([0, 1, 2].map(directorFact))

/** The billed names, in order. */
export function billedNames(data: PeopleData, facts: RewindFactsV3): { actors: string[]; directors: string[] } {
  return {
    actors: Array.from({ length: data.actors }, (_, i) => shown(facts, actorFact(i))),
    directors: Array.from({ length: data.directors }, (_, i) => shown(facts, directorFact(i))),
  }
}

function peopleSummary(data: PeopleData, facts: RewindFactsV3): string {
  const { actors, directors } = billedNames(data, facts)
  const parts: string[] = []
  if (actors.length > 0) parts.push(actors.length > 1 ? `Starring ${actors[0]}, with ${andList(actors.slice(1))}.` : `Starring ${actors[0]}.`)
  if (directors.length > 0) parts.push(`Directed by ${andList(directors)}.`)
  return parts.join(" ")
}

export const peoplePage: PageDefinition<PeopleData> = {
  select: (_facts, { stats }) => {
    const { people } = stats
    if (!people.eligible) return null
    const data = { actors: people.actors.length, directors: people.directors.length }
    return data.actors + data.directors > 0 ? data : null
  },
  schema: PeopleDataSchema,
  srSummary: peopleSummary,
  // Every billed name, in billing order; a deck that only names them again is left out.
  article: (data, facts, ctx) => {
    const { actors, directors } = billedNames(data, facts)
    return [
      heading(headline("people", facts), facts),
      ...deckBlock(pageDeck(ctx, facts, "people"), facts, PEOPLE_FACTS),
      {
        kind: "definitionList",
        entries: [
          ...(actors.length > 0 ? [{ term: "Cast", detail: plain(andList(actors)) }] : []),
          ...(directors.length > 0 ? [{ term: "Directed by", detail: plain(andList(directors)) }] : []),
        ],
      },
    ]
  },
  share: { facts: PEOPLE_FACTS },
}
