import type { CSSProperties } from "react"

import { issueTone } from "@/components/rewind/media/issue-tone"
import { RewindPoster } from "@/components/rewind/media/poster"
import { has, num, shown } from "@/lib/rewind/pages/facts"
import { FILM_LIST_MIN } from "@/lib/rewind/pages/top-films"
import type { TopFilmsData } from "@/lib/rewind/pages/top-lists.schema"
import { filmFact } from "@/lib/rewind/pages/top-shows"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { CopyText } from "./copy-text"
import { FittedLines } from "./fitted-lines"
import { SentenceHeadline } from "./headline"
import { deckText, type PageProps } from "./issue-context"
import { rowTitle } from "./top-shows"
import { axes, u, ut } from "./units"

/** The stub's title measure: the artboard less the poster, the stub column and the gaps. */
const STUB_TITLE = 214
const ROW_TITLE = 222

/** "x2" for a film played twice or more, in the width-62 cut; nothing for one play. */
function Rewatch({ facts, i }: { facts: RewindFactsV3; i: number }) {
  if (num(facts, filmFact(i, "plays")) < 2) return null
  return (
    <span className="font-display tabular-nums" style={{ fontVariationSettings: axes(62, 900) }} data-testid="rewind-film-rewatch">
      <span aria-hidden>x{shown(facts, filmFact(i, "plays"))}</span>
      <span className="sr-only">, watched {shown(facts, filmFact(i, "plays"))} times</span>
    </span>
  )
}

/**
 * 06 Top films (design 4.3): marigold (or its `altField`), the No. 1 in full
 * colour inside a ticket stub with a perforated edge that tears in, rows 2
 * to 5 duotoned between the page's spot and field, rewatches as "x2", and
 * the finished share and the longest film. Fewer than 3 films make a single
 * feature: the stub alone.
 */
export function TopFilmsPage({ data, issue }: PageProps<TopFilmsData>) {
  const { facts } = issue
  const tone = issueTone(issue, "top-films")
  const title = shown(facts, filmFact(0, "title"))
  const rows = data.rows.length >= FILM_LIST_MIN ? data.rows.slice(1) : []
  const plays = num(facts, filmFact(0, "plays"))

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(12)}` }} data-testid="rewind-page-top-films">
      <SentenceHeadline text={headline("top-films", facts)} />
      <p style={{ fontSize: u(18), lineHeight: 1.3, marginTop: u(8) }}>
        <CopyText text={deckText(issue, "topFilms")} source={facts} />
      </p>
      <section aria-labelledby="rewind-top-films-no1" className="rw-tear flex border-[1.5px] border-current" style={{ marginTop: u(14) }} data-testid="rewind-top-films-stub">
        <div className="flex min-w-0 flex-1 items-start" style={{ gap: u(12), padding: u(10) }}>
          <RewindPoster titleKey={data.rows[0].key} title={title} width={84} colour="full" tone={tone} priority />
          <div className="min-w-0 flex-1">
            <h3 id="rewind-top-films-no1">
              <FittedLines fit={fitLines(title, { role: "nameplate", metrics: pageMetrics, weight: 900, measure: STUB_TITLE, maxLines: 3, sizeMin: 22, sizeMax: 40, widths: [62] })} weight={900} />
            </h3>
            <p className="font-display tabular-nums" style={{ fontSize: u(30), lineHeight: 1, marginTop: u(8), fontVariationSettings: axes(75, 900) }}>
              {shown(facts, filmFact(0, "minutes"))}
            </p>
            <p style={{ fontSize: u(15), marginTop: u(4) }}>
              {plays >= 2 ? (
                <>
                  your most-played film, <Rewatch facts={facts} i={0} />
                </>
              ) : (
                "your most-played film"
              )}
            </p>
          </div>
        </div>
        <div
          aria-hidden
          className="flex flex-col items-center justify-center border-l-[1.5px] border-dashed border-current font-display"
          style={{ width: u(44), fontVariationSettings: axes(62, 900) }}
        >
          <span style={{ fontSize: ut(13) }}>No.</span>
          <span style={{ fontSize: u(34), lineHeight: 1 }}>1</span>
        </div>
      </section>
      {rows.length > 0 && (
        <ol start={2} aria-label={`Numbers 2 to ${rows.length + 1}`} className="border-t-[1.5px] border-current" style={{ marginTop: u(12) }}>
          {rows.map((row, j) => {
            const i = j + 1
            const film = shown(facts, filmFact(i, "title"))
            return (
              <li key={row.key} className="rw-row flex items-center border-b border-current/40" style={{ gap: u(10), padding: `${u(5)} 0`, "--rw-i": j } as CSSProperties}>
                <span aria-hidden className="w-[calc(var(--u)*18px)] text-center font-display tabular-nums" style={{ fontSize: u(32), lineHeight: 1, fontVariationSettings: axes(62, 900) }}>
                  {i + 1}
                </span>
                <RewindPoster titleKey={row.key} title={film} width={32} colour="duo" tone={tone} className="text-chart-2" />
                <span className="min-w-0 flex-1">
                  <FittedLines fit={rowTitle(film, ROW_TITLE)} weight={760} lineHeight={1.08} />
                </span>
                <span className="flex flex-col items-end" style={{ fontSize: u(15.5), gap: u(2) }}>
                  <span className="font-display whitespace-nowrap tabular-nums" style={{ fontVariationSettings: axes(87.5, 700) }}>
                    {shown(facts, filmFact(i, "minutes"))}
                  </span>
                  <Rewatch facts={facts} i={i} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <dl className="mt-auto grid grid-cols-2 border-t-[1.5px] border-current font-display" style={{ paddingTop: u(8), gap: u(10), fontSize: ut(13), fontVariationSettings: axes(100, 650) }}>
        {has(facts, "films.finishedShare") && (
          <div>
            <dt>Finished</dt>
            <dd style={{ fontSize: u(24), fontVariationSettings: axes(75, 900) }}>{shown(facts, "films.finishedShare")}</dd>
          </div>
        )}
        {has(facts, "films.longest.title") && (
          <div className="min-w-0">
            <dt>Longest</dt>
            <dd dir="auto" className="font-text italic" style={{ fontSize: u(15) }}>
              {shown(facts, "films.longest.title")}, {shown(facts, "films.longest.minutes")}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
