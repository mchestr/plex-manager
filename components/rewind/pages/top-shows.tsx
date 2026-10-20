import { issueTone } from "@/components/rewind/media/issue-tone"
import { RewindPoster } from "@/components/rewind/media/poster"
import { formatRewindDuration, pluralWord } from "@/lib/rewind/format"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import type { TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { countedMonths, monthName, seriesFact } from "@/lib/rewind/pages/top-shows"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { copyLocals, headline, quizCallback } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { SentenceHeadline } from "./headline"
import { deckText, type IssueContext, type PageProps } from "./issue-context"
import { ListRows, type ListRow } from "./list-rows"
import { QuizDeck } from "./quiz-deck"
import { SmallMultiple } from "./small-multiple"
import { axes, MEASURE, tight, u, ut } from "./units"

const EPISODES = { one: "episode", other: "episodes" }
const SEASONS = { one: "season", other: "seasons" }
const MIN_VIEWERS = 3
/** A row's title measure: the artboard less the rank, thumbnail, hours column and gaps. */
const ROW_TITLE = 190

const featureTitle = (title: string) => fitLines(title, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 3, sizeMin: 30, sizeMax: 52, widths: [62] })
/** A list title (design 5.4): Archivo 760 at width 87.5, 18.5 px, up to 3 balanced lines, then an ellipsis. */
export const rowTitle = (title: string, measure = ROW_TITLE) =>
  fitLines(title, { role: "sentence", metrics: pageMetrics, weight: 760, measure, maxLines: 3, sizeMin: 18.5, sizeMax: 18.5, widths: [87.5] })

/**
 * A gap between the page's blocks, `px` logical px, that gives way when the
 * column runs out of height: below the 0.8 scale floor, text held at its
 * 12 px floor stops scaling with the page (design 4.7).
 */
function Gap({ px }: { px: number }) {
  return <div aria-hidden className="min-h-0" style={{ flex: `0 1 ${u(px)}` }} />
}

/** "16 episodes", plus "watched twice" when the series was watched over again. */
function episodeNote(facts: RewindFactsV3, i: number, locale: string): string {
  const episodes = `${shown(facts, seriesFact(i, "episodes"))} ${pluralWord(num(facts, seriesFact(i, "episodes")), EPISODES, { locale })}`
  return has(facts, seriesFact(i, "rewatched")) ? `${episodes}, ${shown(facts, seriesFact(i, "rewatched"))}` : episodes
}

/** "3 months, Sep to Nov": the No. 1's active months. */
function activeMonths(monthly: readonly number[], facts: RewindFactsV3, locale: string): string {
  const active = monthly.flatMap((m, i) => (m > 0 ? [i + 1] : []))
  if (active.length === 0) return ""
  const count = num(facts, seriesFact(0, "monthsActive"))
  const first = monthName(active[0], locale, "short")
  const last = monthName(active[active.length - 1], locale, "short")
  return `${shown(facts, seriesFact(0, "monthsActive"))} ${pluralWord(count, { one: "month", other: "months" }, { locale })}${first === last ? `, ${first}` : `, ${first} to ${last}`}`
}

/** The deck, or after the quiz the callback naming the guess (series quizzes only: the No. 1 here is the answer). */
function Deck({ issue }: { issue: IssueContext }) {
  const deck = <CopyText text={deckText(issue, "topShows")} source={issue.facts} />
  const guess = issue.pages.find((page) => page.type === "guess")?.data as GuessData | undefined
  const callbacks = guess?.kind === "series"
    ? Object.fromEntries(
        guess.options.map((o) => [o.key, <CopyText key={o.key} text={quizCallback(o.rank)} source={{ ...issue.facts, ...copyLocals({ year: issue.year, guess: o.title }) }} />])
      )
    : {}
  return <QuizDeck deck={deck} callbacks={callbacks} />
}

function rowDetail(data: TopShowsData, i: number, issue: IssueContext): ListRow["detail"] {
  const { facts, locale } = issue
  const months = countedMonths(facts)
  return {
    title: shown(facts, seriesFact(i, "title")),
    numbers: [
      ["Watched", shown(facts, seriesFact(i, "minutes"))],
      ["Episodes", shown(facts, seriesFact(i, "episodes"))],
      ...(has(facts, seriesFact(i, "seasons")) ? [["Seasons", shown(facts, seriesFact(i, "seasons"))] as [string, string]] : []),
      ...(has(facts, seriesFact(i, "monthsActive")) ? [["Months", shown(facts, seriesFact(i, "monthsActive"))] as [string, string]] : []),
    ],
    table: {
      caption: `Minutes by month, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}.`,
      columns: ["Month", "Watched"],
      rows: data.rows[i].monthly.slice(0, months).map((minutes, m) => [monthName(m + 1, locale, "long"), minutes > 0 ? formatRewindDuration(minutes, { locale }) : ""]),
    },
  }
}

/**
 * 05 Top shows (design 4.3, `slide-05-top-shows.png`): the headline, the
 * deck (or the quiz callback), the No. 1 as a feature (nameplate title
 * breaking after the colon, the full-colour poster with its keyline and the
 * match-cut slot, the hours at 44 px, the biggest night and the viewer rank
 * from 3 viewers), then rows 2 to 5 with duotone thumbnails, balanced
 * titles, notes, hours and small multiples on one scale. One series is a
 * single feature.
 *
 * The gaps between the blocks give way when the column runs out of height,
 * and the No. 1's own gaps tighten below the 0.8 scale floor; the text and
 * the posters keep their sizes (design 4.7).
 */
export function TopShowsPage({ data, issue }: PageProps<TopShowsData>) {
  const { facts, locale } = issue
  const tone = issueTone(issue, "top-shows")
  const months = countedMonths(facts)
  const max = Math.max(...data.rows.flatMap((row) => row.monthly.slice(0, months)))
  const no1 = shown(facts, seriesFact(0, "title"))
  const viewers = num(facts, seriesFact(0, "viewerCount"))
  const night = num(facts, seriesFact(0, "biggestNight.episodes"))
  const seasons = num(facts, seriesFact(0, "seasons"))

  const rows: ListRow[] = data.rows.slice(1).map((row, j) => {
    const i = j + 1
    const title = shown(facts, seriesFact(i, "title"))
    return {
      key: row.key,
      detail: rowDetail(data, i, issue),
      content: (
        <>
          <span className="w-[calc(var(--u)*18px)] text-center font-display tabular-nums" style={{ fontSize: u(32), lineHeight: 1, fontVariationSettings: axes(62, 900) }}>
            {i + 1}
          </span>
          <RewindPoster titleKey={row.key} title={title} width={32} colour="duo" tone={tone} className="text-chart-2" />
          <span className="min-w-0 flex-1">
            <FittedLines fit={rowTitle(title)} weight={760} lineHeight={1.08} />
            <span className="block italic" style={{ fontSize: ut(14), lineHeight: 1.2 }}>
              {episodeNote(facts, i, locale)}
            </span>
          </span>
          <span className="flex flex-col items-end self-center" style={{ gap: u(5) }}>
            <span className="font-display whitespace-nowrap tabular-nums" style={{ fontSize: u(15.5), lineHeight: 1.2, fontVariationSettings: axes(87.5, 700) }}>
              {shown(facts, seriesFact(i, "minutes"))}
            </span>
            <SmallMultiple monthly={row.monthly} max={max} months={months} />
          </span>
        </>
      ),
    }
  })

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0` }} data-testid="rewind-page-top-shows">
      <SentenceHeadline text={headline("top-shows", facts)} />
      <Gap px={8} />
      <p style={{ fontSize: u(18), lineHeight: 1.3 }} data-testid="rewind-top-shows-deck">
        <Deck issue={issue} />
      </p>
      <Gap px={12} />
      <section aria-labelledby="rewind-top-shows-no1" className="border-t-[1.5px] border-current" style={{ paddingTop: tight(9) }} data-testid="rewind-top-shows-feature">
        <p className="flex justify-between font-display" style={{ fontSize: ut(13), lineHeight: 1.2, fontVariationSettings: axes(100, 600) }}>
          <span>No. 1</span>
          {viewers >= MIN_VIEWERS && (
            <span className="tabular-nums" data-testid="rewind-viewer-rank">
              {shown(facts, seriesFact(0, "viewerRank"))} of {shown(facts, seriesFact(0, "viewerCount"))} viewers here
            </span>
          )}
        </p>
        <h3 id="rewind-top-shows-no1" style={{ marginTop: tight(7) }}>
          <FittedLines fit={featureTitle(no1)} weight={900} />
        </h3>
        <div className="flex items-start" style={{ gap: u(14), marginTop: tight(11) }}>
          <span data-rw-match-slot className="block">
            <RewindPoster titleKey={data.rows[0].key} title={no1} width={84} colour="full" tone={tone} priority />
          </span>
          <div className="min-w-0">
            <p className="font-display whitespace-nowrap tabular-nums" style={{ fontSize: u(44), lineHeight: 0.9, fontVariationSettings: axes(75, 900) }}>
              {shown(facts, seriesFact(0, "minutes"))}
            </p>
            <p style={{ fontSize: u(15.5), lineHeight: 1.25, marginTop: tight(5) }}>
              your most-watched series, {shown(facts, seriesFact(0, "episodes"))} {pluralWord(num(facts, seriesFact(0, "episodes")), EPISODES, { locale })}
              {seasons > 1 && ` across ${shown(facts, seriesFact(0, "seasons"))} ${pluralWord(seasons, SEASONS, { locale })}`}
            </p>
            {night >= 2 && (
              <p className="italic" style={{ fontSize: ut(14.5), lineHeight: 1.25, marginTop: tight(7) }}>
                Biggest night: {shown(facts, seriesFact(0, "biggestNight.date"))}, {shown(facts, seriesFact(0, "biggestNight.episodes"))} episodes back to back.
              </p>
            )}
            <p className="flex items-center font-display" style={{ gap: u(7), marginTop: tight(8), fontSize: ut(12.5), lineHeight: 1.2, fontVariationSettings: axes(100, 600) }}>
              <SmallMultiple monthly={data.rows[0].monthly} max={max} months={months} />
              <span>{activeMonths(data.rows[0].monthly, facts, locale)}</span>
            </p>
          </div>
        </div>
      </section>
      {rows.length > 0 && (
        <>
          <Gap px={12} />
          <ListRows rows={rows} start={2} label={`Numbers 2 to ${rows.length + 1}`} />
        </>
      )}
      {months < 12 && (
        <>
          <Gap px={6} />
          <p className="italic" style={{ fontSize: ut(12.5), lineHeight: 1.2 }}>
            December is not yet counted.
          </p>
        </>
      )}
    </div>
  )
}
