/** A golden fixture as the stored v3 Rewind the projection reads, plus a default context and options. */

import { fixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { pagesForCut } from "@/lib/rewind/editions"
import { SHARE_PAGE_TYPES } from "@/lib/rewind/registry"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { ShareContext, ShareOptions } from "@/lib/wrapped/data/share-safe-schema"
import { factsHash } from "@/lib/wrapped/facts/hash"

export async function fixtureRewind(id = "heavy"): Promise<RewindDataV3> {
  const issue = await fixtureIssue(id, { serial: "K7Q4", nthRewind: 4 })
  const from = issue.facts["window.from"]?.value
  const through = issue.facts["window.through"]?.value
  return RewindDataV3.parse({
    version: 3,
    year: 2026,
    statsVersion: "stats-2026.1",
    generatedAt: "2026-12-01T00:20:00.000Z",
    window: { from, through, zone: "America/Chicago", finalCut: false },
    edition: issue.edition,
    facts: issue.facts,
    pages: issue.pages.map(({ type, data }) => ({ type, data })),
    archetype: issue.archetype,
    copy: null,
    copySource: "template",
    copyMeta: { model: null, promptVersion: "rewind-2026.1", slotHashes: {} },
    factsHash: factsHash(issue.facts),
  })
}

/**
 * A short edition as the pipeline stores it: the light fixture's pocket cut
 * (with its Short list), or a postcard holding one page with three community
 * titles.
 */
export async function editionRewind(edition: "pocket" | "postcard"): Promise<RewindDataV3> {
  if (edition === "pocket") {
    const light = await fixtureRewind("light")
    return { ...light, pages: pagesForCut(light, "pocket") }
  }
  const postcard = await fixtureRewind("postcard")
  const titles = [
    { key: "series:101", title: "Severance" },
    { key: "film:202", title: "Dune: Part Two" },
    { key: "series:303", title: "Slow Horses" },
  ]
  return { ...postcard, pages: [{ type: "postcard", data: { titles } }] }
}

export function shareContext(overrides: Partial<ShareContext> = {}): ShareContext {
  return {
    userId: "user-1",
    serverName: "Chester Family Plex",
    showServerName: true,
    publicCounts: false,
    allowArt: true,
    hiddenKeys: new Set(),
    exclusionsVersion: 0,
    ...overrides,
  }
}

export function shareOptions(overrides: Partial<ShareOptions> = {}): ShareOptions {
  return { pages: [...SHARE_PAGE_TYPES], signed: false, includeArt: false, dailyDetail: false, cardFacts: [], ...overrides }
}
