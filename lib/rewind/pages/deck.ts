/**
 * A page's deck: the stored model copy, else its template (design 8.5). The
 * story page and article mode both read it here.
 *
 * @module lib/rewind/pages/deck
 */

import type { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { slotTemplate } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

export type DeckKey = keyof RewindCopyV3Wire["decks"]

export function pageDeck(issue: { copy: RewindCopyV3Wire | null; userId: string }, facts: RewindFactsV3, key: DeckKey): string {
  const stored = issue.copy?.decks[key]
  if (stored) return stored
  return slotTemplate(`deck.${key}`, { facts, userId: issue.userId })
}
