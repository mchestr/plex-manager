/**
 * 14 Requests (design 4.3, RWP-06): what the member asked the server for,
 * and whether they watched it, as a receipt with dotted leaders and a fitted
 * total under "You asked for 27. You watched 15 of them."
 *
 * - Approved counts statuses 2 and 5; available follows `media.status` (5
 *   for films, 4 or 5 for series); watched joins through the cache's guids
 *   (`lib/wrapped/stats/requests.ts`).
 * - Declined requests get a ledger line but never reach the headline or the
 *   deck. A line at 0 is left out.
 * - Kept with 1 request or more and an Overseerr row. The card prints counts
 *   only, never a request title.
 *
 * @module lib/rewind/pages/requests
 */

import { deckBlock, heading, plain } from "@/lib/rewind/article/blocks"
import type { PageDefinition } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { num, shown } from "./facts"
import { LEDGER_LINES, RequestsDataSchema, type RequestsData } from "./requests.schema"

type LedgerFact = (typeof LEDGER_LINES)[number]

/** Each line's label on the receipt. */
export const LEDGER_LABELS: Record<LedgerFact, string> = {
  "requests.approved": "Approved",
  "requests.available": "Arrived on the server",
  "requests.watched": "Watched",
  "requests.pending": "Still waiting",
  "requests.declined": "Declined",
}

function requestsSummary(data: RequestsData, facts: RewindFactsV3): string {
  const lines = data.lines.map((id) => `${LEDGER_LABELS[id].toLowerCase()} ${shown(facts, id)}`)
  return [`Your requests this year: asked for ${shown(facts, "requests.made")}`, ...lines].join(", ") + "."
}

export const requestsPage: PageDefinition<RequestsData> = {
  select: (facts, { stats }) => {
    if (!stats.requests.eligible || num(facts, "requests.made") === 0) return null
    return { lines: LEDGER_LINES.filter((id) => num(facts, id) > 0) }
  },
  schema: RequestsDataSchema,
  srSummary: requestsSummary,
  // The headline gives made and watched (watched whenever it is above 0); the list gives each other ledger line.
  article: (data, facts, ctx) => {
    const lines = data.lines.filter((id) => id !== "requests.watched")
    return [
      heading(headline("requests", facts), facts),
      ...deckBlock(pageDeck(ctx, facts, "requests"), facts, ["requests.made", ...data.lines]),
      ...(lines.length > 0 ? [{ kind: "definitionList" as const, entries: lines.map((id) => ({ term: LEDGER_LABELS[id], detail: plain(shown(facts, id)) })) }] : []),
    ]
  },
  share: { facts: ["requests.made", "requests.approved", "requests.available", "requests.watched"] },
}
