import type { Route } from "next"

import { pageDeck, type DeckKey } from "@/lib/rewind/pages/deck"
import type { Edition, RewindPageType } from "@/lib/rewind/registry"
import type { SelectedPage } from "@/lib/rewind/select-pages"
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
  /**
   * The page types of both cuts (P7.3), for the cover's cut buttons: `full`
   * is null for a pocket member. Without it the cover counts `pages` and
   * `POCKET_ESTIMATE`.
   */
  cuts?: { full: readonly RewindPageType[] | null; pocket: readonly RewindPageType[] }
  /** The server's Plex web app, for the postcard's "Browse the library". */
  libraryHref?: string
}

export interface PageProps<D> {
  data: D
  issue: IssueContext
}

/** A page's deck: the stored model copy, else its template (design 8.5). */
export function deckText(issue: IssueContext, key: DeckKey): string {
  return pageDeck(issue, issue.facts, key)
}

/** The folio of a selected page, or null when it is not in the issue. */
export function folioOf(issue: IssueContext, type: SelectedPage["type"]): number | null {
  return issue.pages.find((page) => page.type === type)?.folio ?? null
}
