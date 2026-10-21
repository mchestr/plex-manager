import type { ReactNode } from "react"

import { formatDayMonth } from "@/lib/rewind/format"
import { shown } from "@/lib/rewind/pages/facts"
import { PART_HEADINGS, partTitle, pickReason, type NextYearPart } from "@/lib/rewind/pages/next-year"
import type { NextYearData } from "@/lib/rewind/pages/next-year.schema"
import { ratingKeyOf } from "@/lib/rewind/pages/title-key.schema"
import { overseerrSeriesHref, plexItemHref, type ItemLinks } from "@/lib/ui/plex-links"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { deckText, type IssueContext, type PageProps } from "./issue-context"
import { axes, u, ut } from "./units"

interface Listing {
  key: string
  /** The left column, in tabular numerals: an episode, a date or a year. */
  when: string
  title: string
  href: string | null
  /** The line under the title. */
  note: ReactNode
}

const NO_LINKS: ItemLinks = { plexServerId: null, overseerrUrl: null }

function Title({ title, href }: { title: string; href: string | null }) {
  if (!href) return <i>{title}</i>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-rw-interactive
      data-testid="rewind-next-year-link"
      className="underline decoration-1 underline-offset-[0.18em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <i>{title}</i>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

/** One part of the column: an optional heading over its listings. */
function Part({ part, rows, heading }: { part: NextYearPart; rows: readonly Listing[]; heading: boolean }) {
  if (rows.length === 0) return null
  return (
    <section style={{ marginTop: u(14) }} data-testid={`rewind-next-year-${part}`}>
      {heading && (
        <h3 className="border-b-[1.5px] border-current font-display" style={{ fontSize: ut(14), fontVariationSettings: axes(100, 760), paddingBottom: u(4) }}>
          {PART_HEADINGS[part]}
        </h3>
      )}
      <ol>
        {rows.map((row, i) => (
          <li key={row.key} className="rw-bill-line flex border-b border-current/40" style={{ gap: u(12), padding: `${u(7)} 0`, animationDelay: `${420 + i * 60}ms` }}>
            <span className="w-[calc(var(--u)*76px)] shrink-0 font-display tabular-nums" style={{ fontSize: ut(14), fontVariationSettings: axes(87.5, 760), paddingTop: u(3) }}>
              {row.when}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-lead" style={{ fontSize: u(21), lineHeight: 1.15 }}>
                <Title title={row.title} href={row.href} />
              </span>
              <span className="block" style={{ fontSize: ut(14), lineHeight: 1.3, marginTop: u(2) }}>
                {row.note}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function listings(data: NextYearData, issue: IssueContext): Record<NextYearPart, Listing[]> {
  const { facts } = issue
  const links = issue.links ?? NO_LINKS
  const plex = (key: string) => plexItemHref(links.plexServerId, key)
  return {
    leftForLater: data.leftForLater.map((row, i) => ({
      key: row.key,
      when: `S${row.season}\u00A0E${row.episode}`,
      title: shown(facts, partTitle("leftForLater", i)),
      href: plex(ratingKeyOf(row.key)),
      note: `Left off on ${formatDayMonth(row.lastWatched, issue)}`,
    })),
    returning: data.returning.map((row, i) => ({
      key: row.key,
      when: shown(facts, `next.returning[${i + 1}].date` as FactId),
      title: shown(facts, partTitle("returning", i)),
      href: (row.tmdbId !== null ? overseerrSeriesHref(links.overseerrUrl, row.tmdbId) : null) ?? plex(ratingKeyOf(row.key)),
      note: `Season ${row.season} premieres`,
    })),
    picks: data.picks.map((row, i) => ({
      key: row.ratingKey,
      when: row.year === null ? (row.kind === "film" ? "Film" : "Series") : String(row.year),
      title: shown(facts, partTitle("picks", i)),
      href: plex(row.ratingKey),
      note: <CopyText text={pickReason(row.because)} source={facts} />,
    })),
  }
}

/**
 * 17 Next year (design 4.3): "Unfinished business" as a cinema-listings
 * column. The series left for later sit under the headline; the returning
 * seasons and the picks follow under their own headings. Each title opens on
 * the server's Plex web app, or a returning season on Overseerr.
 */
export function NextYearPage({ data, issue }: PageProps<NextYearData>) {
  const { facts } = issue
  const rows = listings(data, issue)
  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-next-year">
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(36), lineHeight: 1.05 }}>
        {headline("next-year", facts)}
      </h2>
      <p style={{ fontSize: u(18.5), lineHeight: 1.3, marginTop: u(10) }}>
        <CopyText text={deckText(issue, "nextYear")} source={facts} />
      </p>
      <Part part="leftForLater" rows={rows.leftForLater} heading={false} />
      <Part part="returning" rows={rows.returning} heading />
      <Part part="picks" rows={rows.picks} heading />
    </div>
  )
}
