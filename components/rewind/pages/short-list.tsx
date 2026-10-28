import { issueTone } from "@/components/rewind/media/issue-tone"
import { RewindPoster } from "@/components/rewind/media/poster"
import { pluralWord } from "@/lib/rewind/format"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { shortListFact, shortListKind } from "@/lib/rewind/pages/short-list"
import type { ShortListData, ShortListRow } from "@/lib/rewind/pages/short-list.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { POCKET_NOTE, shortListDeck, shortListHeadline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { SentenceHeadline } from "./headline"
import type { PageProps } from "./issue-context"
import { ListRows, type ListRow } from "./list-rows"
import { rowTitle } from "./top-shows"
import { axes, MEASURE, tight, u, ut } from "./units"

const EPISODES = { one: "episode", other: "episodes" }
const PLAYS = { one: "play", other: "plays" }
/** A row's title measure: the artboard less the rank, the minutes column and the gaps. */
const ROW_TITLE = 230

const featureTitle = (title: string) => fitLines(title, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 3, sizeMin: 30, sizeMax: 52, widths: [62] })

/** "Show, 3 episodes", "Movie, 2 plays" or "Movie". */
function rowNote(row: ShortListRow, facts: RewindFactsV3, locale: string): string {
  if (shortListKind(row) === "series") {
    const episodes = num(facts, shortListFact(row, "episodes"))
    return episodes > 0 ? `Show, ${shown(facts, shortListFact(row, "episodes"))} ${pluralWord(episodes, EPISODES, { locale })}` : "Show"
  }
  const plays = num(facts, shortListFact(row, "plays"))
  return plays > 1 ? `Movie, ${shown(facts, shortListFact(row, "plays"))} ${pluralWord(plays, PLAYS, { locale })}` : "Movie"
}

function rowDetail(row: ShortListRow, facts: RewindFactsV3, locale: string): ListRow["detail"] {
  const numbers: Array<[string, string]> = [["Watched", shown(facts, shortListFact(row, "minutes"))]]
  const film = shortListKind(row) === "film"
  const count = film ? "plays" : "episodes"
  if (has(facts, shortListFact(row, count))) numbers.push([film ? "Plays" : "Episodes", shown(facts, shortListFact(row, count))])
  return {
    title: shown(facts, shortListFact(row, "title")),
    numbers,
    table: {
      caption: `${rowNote(row, facts, locale)}, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}.`,
      columns: ["Measure", "Value"],
      rows: numbers.map(([label, value]) => [label, value]),
    },
  }
}

/**
 * Short list (design 4.5, `pocket-short-list.png`): the pocket edition's top
 * 3 titles of any type. The No. 1 is a nameplate with its full-colour poster
 * (or the hero-size title card), its minutes and the member's usual start
 * time; Nos. 2 and 3 are P5.6's list rows, with
 * minute-level numbers ("48 minutes"), then the pocket note.
 */
export function ShortListPage({ data, issue }: PageProps<ShortListData>) {
  const { facts, locale } = issue
  const tone = issueTone(issue, "short-list")
  const [first, ...rest] = data.rows
  const no1 = shown(facts, shortListFact(first, "title"))
  const start = has(facts, "hours.medianStart")

  const rows: ListRow[] = rest.map((row, j) => ({
    key: row.key,
    detail: rowDetail(row, facts, locale),
    content: (
      <>
        <span className="w-[calc(var(--u)*18px)] text-center font-display tabular-nums" style={{ fontSize: u(32), lineHeight: 1, fontVariationSettings: axes(62, 900) }}>
          {j + 2}
        </span>
        <span className="min-w-0 flex-1">
          <FittedLines fit={rowTitle(shown(facts, shortListFact(row, "title")), ROW_TITLE)} weight={760} lineHeight={1.08} />
          <span className="block italic" style={{ fontSize: ut(14), lineHeight: 1.2 }}>
            {rowNote(row, facts, locale)}
          </span>
        </span>
        <span className="self-center font-display whitespace-nowrap tabular-nums" style={{ fontSize: u(15.5), lineHeight: 1.2, fontVariationSettings: axes(87.5, 700) }}>
          {shown(facts, shortListFact(row, "minutes"))}
        </span>
      </>
    ),
  }))

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0` }} data-testid="rewind-page-short-list">
      <SentenceHeadline text={shortListHeadline(data.rows.length)} />
      <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: tight(8) }} data-testid="rewind-short-list-deck">
        <CopyText text={shortListDeck(issue.edition)} source={facts} />
      </p>
      <section aria-labelledby="rewind-short-list-no1" className="border-t-[1.5px] border-current" style={{ marginTop: tight(12), paddingTop: tight(9) }}>
        <p className="font-display" style={{ fontSize: ut(13), lineHeight: 1.2, fontVariationSettings: axes(100, 600) }}>
          No. 1 {shortListKind(first)}
        </p>
        <h3 id="rewind-short-list-no1" style={{ marginTop: tight(7) }}>
          <FittedLines fit={featureTitle(no1)} weight={900} />
        </h3>
        <div className="flex items-start" style={{ gap: u(14), marginTop: tight(11) }}>
          <RewindPoster titleKey={first.key} title={no1} width={84} colour="full" tone={tone} priority />
          <div className="min-w-0">
            <p className="font-display whitespace-nowrap tabular-nums" style={{ fontSize: u(44), lineHeight: 0.9, fontVariationSettings: axes(75, 900) }}>
              {shown(facts, shortListFact(first, "minutes"))}
            </p>
            <p style={{ fontSize: u(15.5), lineHeight: 1.25, marginTop: tight(5) }}>your most-watched {shortListKind(first)}</p>
            {start && (
              <p className="italic" style={{ fontSize: ut(14.5), lineHeight: 1.25, marginTop: tight(7) }} data-testid="rewind-short-list-start">
                <CopyText text="You usually pressed play around {{fact:hours.medianStart}}." source={facts} />
              </p>
            )}
          </div>
        </div>
      </section>
      {rows.length > 0 && (
        <div style={{ marginTop: tight(12) }}>
          <ListRows rows={rows} start={2} label={`Numbers 2 to ${rows.length + 1}`} />
        </div>
      )}
      <p className="flex items-start" style={{ gap: u(10), marginTop: tight(10), fontSize: ut(14.5), lineHeight: 1.3 }} data-testid="rewind-short-list-note">
        <span className="shrink-0 rounded-sm border-[1.5px] border-current font-display" style={{ padding: `${u(2)} ${u(6)}`, fontVariationSettings: axes(100, 700) }}>
          Pocket edition
        </span>
        <span>{POCKET_NOTE}</span>
      </p>
    </div>
  )
}
