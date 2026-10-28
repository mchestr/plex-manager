/**
 * Stored v1 and v2 Rewinds as archive articles (P7.13, design 7.9, RWV-07).
 *
 * ## Overview
 *
 * {@link legacyToArticle} maps the parsed legacy row (`parseStoredRewind`)
 * onto P5.12's article blocks, so `ArticleDocument` prints a 2025 or earlier
 * year on paper in the Rewind fonts, with no story, cards or sharing:
 *
 * | Section | Blocks |
 * |---|---|
 * | The year in numbers | `factRow` of the totals, the opening text |
 * | Top films, Top shows | `rankedList`, one item per `ratingKey` (or title and year) |
 * | Your archetype | `heading` with its name, the tagline and dedication |
 * | Watching habits | `definitionList` of the streak, peak hour, busiest day, weekends |
 * | Month by month | `figure` naming the busiest month, `table` of minutes |
 * | More from the year | the remaining stored text, then a `note` on when it was made |
 *
 * ## Special cases
 *
 * - It never reads `statistics.leaderboards` (P0.8 stripped them; the parser drops them).
 * - Stored text is plain: `<highlight>` tags stripped, any `{{fact:}}` token
 *   rendered empty through `renderCopyText`, and the old name "Wrapped" read as "Rewind".
 * - A stored section with no text to show is dropped with one warning that
 *   names its type only.
 *
 * @module lib/wrapped/data/legacy-article
 */

import { plain, type ArticleBlock, type ArticleText } from "@/lib/rewind/article/blocks"
import type { ArticleSection } from "@/lib/rewind/article/sections"
import { formatCount, formatDayMonth, formatHero, formatHour, formatRewindDuration, formatShare, pluralWord } from "@/lib/rewind/format"
import { createLogger } from "@/lib/utils/logger"
import { renderCopyText } from "@/lib/wrapped/copy/render-copy"
import type { StoredWrappedData, WrappedSection, WrappedSectionType } from "@/lib/wrapped/data/schema-legacy"

const logger = createLogger("REWIND_ARCHIVE")

export interface LegacyArticle {
  /** The `h1`: "{brand} Rewind {year}". */
  title: string
  masthead: ArticleText[]
  sections: ArticleSection[]
}

type SectionId = "numbers" | "films" | "shows" | "archetype" | "habits" | "months" | "more"

/** Where each stored section's text goes. */
const TEXT_HOME: Record<WrappedSectionType, SectionId> = {
  hero: "numbers",
  "total-watch-time": "numbers",
  "movies-breakdown": "numbers",
  "shows-breakdown": "numbers",
  percentile: "numbers",
  "top-movies": "films",
  "top-shows": "shows",
  "archetype-reveal": "archetype",
  "streaks-patterns": "habits",
  "monthly-journey": "months",
  "server-stats": "more",
  "service-stats": "more",
  "overseerr-stats": "more",
  insights: "more",
  "fun-facts": "more",
  finale: "more",
}

/** Stored LLM or template text as plain text. */
const archiveText = (text: string): string =>
  renderCopyText(text.replace(/<\/?highlight>/g, ""), {}).replace(/\bWrapped\b/g, "Rewind").trim()

/** A section's own text: its narrative, and a fun-facts section's list. */
function sectionTexts(section: WrappedSection): string[] {
  const facts = section.type === "fun-facts" && section.data && "facts" in section.data && Array.isArray(section.data.facts) ? section.data.facts : []
  return [section.content, ...facts].flatMap((text) => (typeof text === "string" && archiveText(text) ? [archiveText(text)] : []))
}

/** One ranked item per `ratingKey`, else per title and year. */
function ranked<T extends { title: string; year?: number; ratingKey?: string }>(items: readonly T[], detail: (item: T) => string) {
  const seen = new Set<string>()
  return items
    .filter((item) => {
      const key = item.ratingKey ?? `${item.title}|${item.year ?? ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
    .map((item, i) => ({ rank: i + 1, title: item.year ? `${item.title} (${item.year})` : item.title, detail: detail(item) }))
}

/**
 * Maps a stored v1 or v2 Rewind to an archive article.
 *
 * @param legacy - The parsed row (`parseStoredRewind(...).legacy`).
 * @param options - The route's year, the server name and the display locale.
 */
export function legacyToArticle(legacy: StoredWrappedData, { year, brand, locale }: { year: number; brand: string; locale: string }): LegacyArticle {
  const s = legacy.statistics
  const settings = { locale }
  const blocks: Record<SectionId, ArticleBlock[]> = { numbers: [], films: [], shows: [], archetype: [], habits: [], months: [], more: [] }
  const add = (id: SectionId, ...more: ArticleBlock[]) => blocks[id].push(...more)
  const words = (n: number, one: string, other: string) => pluralWord(n, { one, other }, settings)

  add("numbers", {
    kind: "factRow",
    items: [
      { value: formatHero(s.totalWatchTime.total, settings), label: `${words(s.totalWatchTime.total, "minute", "minutes")} watched` },
      { value: formatHero(s.moviesWatched, settings), label: words(s.moviesWatched, "movie", "movies") },
      { value: formatHero(s.showsWatched, settings), label: words(s.showsWatched, "show", "shows") },
      { value: formatHero(s.episodesWatched, settings), label: words(s.episodesWatched, "episode", "episodes") },
    ],
  })
  const films = ranked(s.topMovies, (m) => formatRewindDuration(m.watchTime, settings))
  if (films.length) add("films", { kind: "rankedList", label: "Your most watched movies", items: films })
  const shows = ranked(s.topShows, (t) => formatCount(t.episodesWatched, { one: "episode", other: "episodes" }, settings))
  if (shows.length) add("shows", { kind: "rankedList", label: "Your most watched shows", items: shows })

  if (legacy.archetype) {
    const { name, tagline, dedication } = legacy.archetype
    add("archetype", { kind: "heading", text: plain(archiveText(name)) })
    for (const text of [tagline, dedication].map(archiveText).filter(Boolean)) add("archetype", { kind: "paragraph", text: plain(text) })
  }

  const d = s.derived
  const habits = [
    d?.longestStreak && { term: "Longest streak", detail: formatCount(d.longestStreak.days, { one: "day", other: "days" }, settings) },
    d?.peakHour && { term: "Peak hour", detail: formatHour(d.peakHour.hour, settings) },
    d?.mostActiveDay && { term: "Busiest day", detail: `${formatDayMonth(d.mostActiveDay.date, settings)}, ${formatRewindDuration(d.mostActiveDay.watchTime, settings)}` },
    d && { term: "On weekends", detail: formatShare(d.weekendVsWeekday.weekendPct / 100, settings) },
  ].flatMap((entry) => (entry ? [{ term: entry.term, detail: plain(entry.detail) }] : []))
  if (habits.length) add("habits", { kind: "definitionList", entries: habits })

  const months = s.watchTimeByMonth ?? []
  if (months.length) {
    const busiest = months.reduce((top, month) => (month.watchTime > top.watchTime ? month : top))
    const monthName = (m: (typeof months)[number]) => m.monthName || new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(Date.UTC(year, m.month - 1))
    add(
      "months",
      { kind: "figure", summary: `Your busiest month was ${monthName(busiest)}, with ${formatRewindDuration(busiest.watchTime, settings)}.` },
      { kind: "table", table: { caption: "Minutes watched each month", columns: ["Month", "Minutes"], rows: months.map((m) => [monthName(m), formatHero(m.watchTime, settings)]) } }
    )
  }

  // Each stored text once: new v2 rows repeat the fun facts in a section and in `insights`.
  const told = new Set<string>()
  const tell = (id: SectionId, text: string) => {
    if (told.has(text)) return
    told.add(text)
    add(id, { kind: "paragraph", text: plain(text) })
  }
  for (const section of legacy.sections) {
    const texts = sectionTexts(section)
    if (texts.length === 0) logger.warn("Archive section dropped", { type: section.type })
    for (const text of texts) tell(TEXT_HOME[section.type], text)
  }
  for (const fact of legacy.insights.funFacts.map(archiveText)) if (fact) tell("more", fact)
  const made = Date.parse(legacy.generatedAt)
  add("more", {
    kind: "note",
    text: plain(
      Number.isNaN(made)
        ? "Archive Rewinds keep the numbers and words they were made with."
        : `Made ${new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(made)}. Archive Rewinds keep the numbers and words they were made with.`
    ),
  })

  const names: Record<SectionId, string> = {
    numbers: "The year in numbers",
    films: "Top movies",
    shows: "Top shows",
    archetype: "Your archetype",
    habits: "Watching habits",
    months: "Month by month",
    more: "More from the year",
  }
  const sections = (Object.keys(names) as SectionId[])
    .filter((id) => blocks[id].length > 0)
    .map((id) => ({ id: `archive-${id}`, folio: null, name: names[id], type: null, blocks: blocks[id] }))

  return { title: `${brand} Rewind ${year}`, masthead: [plain("From the archive")], sections }
}
