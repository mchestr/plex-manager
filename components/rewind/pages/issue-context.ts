import type { Route } from "next"

import type { Edition } from "@/lib/rewind/registry"
import type { SelectedPage } from "@/lib/rewind/select-pages"
import { slotTemplate } from "@/lib/wrapped/copy/templates"
import type { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

/** What every page of one issue shares at render. */
export interface IssueContext {
  year: number
  userId: string
  locale: string
  /** `serverName()`: the masthead. */
  serverName: string
  edition: Edition
  /** The selected list: folios, cover lines and the page counts read it. */
  pages: readonly SelectedPage[]
  copy: RewindCopyV3Wire | null
  copySource: RewindDataV3["copySource"]
  /** Where Close and the back cover's "Done" go: P5.1's `safeReturnPath(from)`. */
  returnTo: Route
  /** `copyMeta.model`, for the AI disclosure in "Why this?". */
  model: string | null
  /** Whose zone `tz.label` is, for the `tz.note` wording. */
  zone: "member" | "server"
  facts: RewindFactsV3
}

export interface PageProps<D> {
  data: D
  issue: IssueContext
}

type DeckKey = keyof RewindCopyV3Wire["decks"]

/** A page's deck: the stored model copy, else its template (design 8.5). */
export function deckText(issue: IssueContext, key: DeckKey): string {
  const stored = issue.copy?.decks[key]
  if (stored) return stored
  const slot = `deck.${key}` as const
  return slotTemplate(slot, { facts: issue.facts, userId: issue.userId })
}

/** The folio of a selected page, or null when it is not in the issue. */
export function folioOf(issue: IssueContext, type: SelectedPage["type"]): number | null {
  return issue.pages.find((page) => page.type === type)?.folio ?? null
}
