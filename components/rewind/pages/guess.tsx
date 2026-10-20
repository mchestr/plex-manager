import { issueTone } from "@/components/rewind/media/issue-tone"
import { RewindPoster } from "@/components/rewind/media/poster"
import { shown } from "@/lib/rewind/pages/facts"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { quizHeadline, quizReveal } from "@/lib/wrapped/copy/templates"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

import { FittedLines } from "./fitted-lines"
import { SentenceHeadline } from "./headline"
import type { PageProps } from "./issue-context"
import { Quiz, type QuizTile } from "./quiz"
import { u } from "./units"

/** A tile's poster and title measure, in logical px: two tiles and a 16 px gap across the 358 px measure. */
const TILE = 171
const ART = 120
const HEADING_ID = "rewind-guess-heading"

/** A tile title: Archivo 760 at width 87.5, 16 px, up to 3 balanced lines. */
const tileTitle = (title: string) => fitLines(title, { role: "sentence", metrics: pageMetrics, weight: 760, measure: TILE, maxLines: 3, sizeMin: 16, sizeMax: 16, widths: [87.5] })

/**
 * 04 Guess (design 4.3): the question as the headline, then a 2 x 2 grid of
 * full-colour poster tiles (title cards when art is missing) with their
 * titles in up to 3 balanced lines, and "Skip". The tiles are the `Quiz`
 * island; everything it shows is typeset here.
 */
export function GuessPage({ data, issue }: PageProps<GuessData>) {
  const tone = issueTone(issue, "guess")
  const tiles: QuizTile[] = data.options.map((option) => ({
    key: option.key,
    rank: option.rank,
    title: option.title,
    titleLines: <FittedLines fit={tileTitle(option.title)} weight={760} lineHeight={1.05} />,
    art: <RewindPoster titleKey={option.key} title={option.title} width={ART} colour="full" tone={tone} priority />,
    hours: option.minutes ? shown(issue.facts, option.minutes as FactId) : null,
  }))
  const reveals = Object.fromEntries(data.options.map((o) => [o.rank, quizReveal(o.rank)]))

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0`, gap: u(14) }} data-testid="rewind-page-guess">
      <SentenceHeadline id={HEADING_ID} text={quizHeadline(data.kind)} />
      <Quiz kind={data.kind} labelledBy={HEADING_ID} tiles={tiles} reveals={reveals} />
    </div>
  )
}
