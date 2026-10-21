import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import type { StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"
import { legacyToArticle } from "@/lib/wrapped/data/legacy-article"

import { ArticleDocument } from "./article-document"

interface ArchiveArticleProps {
  legacy: StoredWrappedData
  year: number
  /** The server name, for the "{brand} Rewind {year}" title. */
  brand: string
  locale: string
  actions?: ReactNode
  notice?: ReactNode
}

/**
 * A stored v1 or v2 Rewind as an archive article (P7.13, design 7.9): the
 * article renderer on paper, with no story, cards or sharing. The member's
 * year and article routes and the admin history page render it.
 */
export function ArchiveArticle({ legacy, year, brand, locale, actions, notice }: ArchiveArticleProps) {
  const article = legacyToArticle(legacy, { year, brand, locale })
  return <ArticleDocument title={article.title} masthead={article.masthead} sections={article.sections} actions={actions} notice={notice} />
}

const linkClass = "font-display font-semibold underline underline-offset-4"

/** The member's links out of an archive article: their other years, then Close. */
export function ArchiveActions({ year, years, returnTo }: { year: number; years: readonly number[]; returnTo: Route }) {
  return (
    <>
      {years
        .filter((other) => other !== year)
        .map((other) => (
          <Link key={other} href={`/rewind/${other}`} className={linkClass} data-testid={`rewind-year-link-${other}`}>
            Rewind {other}
          </Link>
        ))}
      <a href={returnTo} className={linkClass} data-testid="rewind-article-close">
        Close
      </a>
    </>
  )
}
