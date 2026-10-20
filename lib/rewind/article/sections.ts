/**
 * A stored issue as article sections (P5.12): every selected page, in
 * registry order, with its folio, its one name and its blocks.
 *
 * @module lib/rewind/article/sections
 */

import { registry, type IssuePageType, type RegistryEntry } from "@/lib/rewind/registry"
import type { SelectedPage } from "@/lib/rewind/select-pages"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { figure, tableBlock, type ArticleBlock, type ArticleContext } from "./blocks"

/** One `<section>` of the article. Legacy years (P7.13) have no folio or page type. */
export interface ArticleSection {
  id: string
  folio: number | null
  name: string
  /** The page it prints; the centrefold starts a new sheet in print. */
  type: IssuePageType | null
  blocks: ArticleBlock[]
}

/** A page's blocks: its own `article`, else its summary and Table (pages whose steps have not landed). */
function articleBlocks(entry: RegistryEntry, data: unknown, facts: RewindFactsV3, ctx: ArticleContext): ArticleBlock[] {
  if (entry.article) return entry.article(data, facts, ctx)
  return [...figure(entry.srSummary(data, facts)), ...tableBlock(entry.table?.(data, facts, ctx))]
}

/** The selected pages, already validated and numbered (`validatePagesOnRead`), as sections. */
export function articleSections(pages: readonly SelectedPage[], facts: RewindFactsV3, ctx: ArticleContext): ArticleSection[] {
  return pages.map((page) => {
    const entry: RegistryEntry = registry[page.type]
    return { id: `page-${page.type}`, folio: page.folio, name: entry.name, type: page.type, blocks: articleBlocks(entry, page.data, facts, ctx) }
  })
}
