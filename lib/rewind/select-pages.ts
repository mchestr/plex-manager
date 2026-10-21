/**
 * Which pages a member's issue prints, and their folios (design FR-2, 7.9).
 *
 * `selectPages` runs every registry entry's `select` in issue order, drops
 * the pages that return null, the pages in `Config.rewindDisabledPages` and
 * the pages still waiting for their step (`LATER_PAGES`), and numbers what
 * is left from 1. The folio, the progress segments, the cover lines, Contents
 * and the back-cover index all read that one list, so they renumber together.
 *
 * `validatePagesOnRead` does the same for a stored issue: each page's data is
 * parsed with its registry schema, and a page that fails is dropped with one
 * logged warning instead of breaking the viewer (RWV-12).
 *
 * @module lib/rewind/select-pages
 */

import type { InkName } from "@/lib/design/tokens"
import { issuePages, LATER_PAGES, registry, type IssuePageType, type RegistryEntry, type RewindPageType, type SelectContext } from "@/lib/rewind/registry"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("rewind-pages")

/** A page as `RewindDataV3.pages` stores it. */
export interface StoredPage {
  type: PageType
  data: unknown
}

export interface SelectedPage {
  type: RewindPageType
  /** 1-based, over the selected list. */
  folio: number
  data: unknown
  /** The field it prints in, after `altField`. */
  field: InkName
}

interface Numbering {
  archetype: ArchetypeId | null
  disabledPages: readonly string[]
}

function number(pages: ReadonlyArray<{ type: RewindPageType; data: unknown }>, { archetype, disabledPages }: Numbering): SelectedPage[] {
  return pages
    .filter((page) => !disabledPages.includes(page.type))
    .map((page, i) => ({ ...page, folio: i + 1, field: pageInk(registry[page.type], archetype).ink }))
}

/** Every page whose own rule holds, in issue order, before disabled and later pages are removed. @public The goldens read it. */
export function eligiblePages(facts: RewindFactsV3, ctx: SelectContext): Array<{ type: IssuePageType; data: unknown }> {
  return issuePages.flatMap((entry) => {
    const data = entry.select(facts, ctx)
    return data === null ? [] : [{ type: entry.type, data }]
  })
}

/**
 * @public P5.9 stores its output in `RewindDataV3.pages`.
 *
 * @example
 * ```ts
 * selectPages(facts, { edition: "full", archetype, disabledPages: ["bookends"], stats })
 * // [{ type: "cover", folio: 1, ... }, { type: "number", folio: 2, ... }, { type: "guess", folio: 3, ... }, ...]
 * ```
 */
export function selectPages(facts: RewindFactsV3, ctx: SelectContext): SelectedPage[] {
  const pages = eligiblePages(facts, ctx).filter((page) => !LATER_PAGES.includes(page.type))
  return number(pages, ctx)
}

/** A stored issue's pages, parsed with their schemas and numbered; a page that fails is dropped. */
export function validatePagesOnRead(pages: readonly StoredPage[], numbering: Numbering): SelectedPage[] {
  const dropped: string[] = []
  const valid = pages.flatMap((page) => {
    const entry: RegistryEntry = registry[page.type]
    const parsed = entry.schema.safeParse(page.data)
    if (!parsed.success) {
      dropped.push(page.type)
      return []
    }
    return [{ type: entry.type, data: parsed.data }]
  })
  if (dropped.length > 0) logger.warn("Dropped stored Rewind pages that failed validation", { pages: dropped })
  return number(valid, numbering)
}
