import { RewindFigure } from "@/components/rewind/a11y/figure"
import { formatCount, formatRunningTime } from "@/lib/rewind/format"
import { has, shown } from "@/lib/rewind/pages/facts"
import { coverPage } from "@/lib/rewind/pages/cover"
import type { CoverData } from "@/lib/rewind/pages/cover.schema"
import { issueDurationMs, POCKET_ESTIMATE } from "@/lib/rewind/registry"
import { fitLines } from "@/lib/rewind/typeset/fit-lines"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { copyLocals, coverLines, headline, windowLine } from "@/lib/wrapped/copy/templates"

import { CopyText } from "./copy-text"
import { CoverCuts, type Cut } from "./cover-cuts"
import { FittedLines } from "./fitted-lines"
import type { PageProps } from "./issue-context"
import { SoundtrackStrip } from "./soundtrack-strip"
import { axes, MEASURE, u, ut } from "./units"

const rule = "border-current border-b-[1.5px]"

function cut(label: string, pages: number, ms: number, locale: string): Cut {
  return { label, meta: `${formatCount(pages, { one: "page", other: "pages" }, { locale })}, about ${formatRunningTime(ms)}` }
}

/**
 * 01 Cover (design 4.3, `slide-01-cover.png`): the masthead with the server
 * and "Vol. 4, No. K7Q4", the "Rewind" nameplate, the issue and its data
 * window, the soundtrack, the headline, four cover lines that point at the
 * selected pages, and the cut choice.
 */
export function CoverPage({ data, issue }: PageProps<CoverData>) {
  const { facts, locale } = issue
  const source = { ...facts, ...copyLocals({ year: issue.year }) }
  const nameplate = fitLines("Rewind", { role: "nameplate", metrics: pageMetrics, weight: 900, measure: MEASURE, maxLines: 1, sizeMin: 34, sizeMax: 120, widths: [100] })
  const volume = [has(facts, "member.volume") && `Vol. ${shown(facts, "member.volume")}`, has(facts, "member.serial") && `No. ${shown(facts, "member.serial")}`]
    .filter(Boolean)
    .join(", ")
  const pocketMember = issue.edition === "pocket"
  const types = issue.pages.map((p) => p.type)
  const full = pocketMember ? null : cut("Read the full issue", issue.pages.length, issueDurationMs(types), locale)
  const pocket = cut("Pocket edition", POCKET_ESTIMATE.length, issueDurationMs(POCKET_ESTIMATE), locale)
  const finalCut = facts["window.finalCut"]?.value === 1

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} ${u(16)}` }} data-testid="rewind-page-cover">
      <div className={`flex items-baseline justify-between font-display ${rule}`} style={{ fontSize: u(15), fontVariationSettings: axes(100, 650), paddingBottom: u(7) }}>
        <span>{issue.serverName}</span>
        {volume && <span className="tabular-nums">{volume}</span>}
      </div>
      <p className="rw-stretch" style={{ marginTop: u(10) }}>
        <FittedLines fit={nameplate} weight={900} />
      </p>
      {pocketMember && (
        <p className="font-text italic" style={{ fontSize: u(17), marginTop: u(4) }} data-testid="rewind-pocket-note">
          The pocket edition
        </p>
      )}
      <div className="flex justify-between border-t-[1.5px] border-current font-display" style={{ marginTop: u(10), paddingTop: u(7), fontSize: ut(13), fontVariationSettings: axes(100, 600) }}>
        <span>The {issue.year} issue</span>
        <span data-testid="rewind-cover-window">
          <CopyText text={windowLine(facts)} source={source} />
        </span>
      </div>
      <RewindFigure summary={coverPage.srSummary(data, facts)} className="mt-[calc(var(--u)*18px)]">
        <SoundtrackStrip minutes={data.minutes} from={String(facts["window.from"]?.value)} locale={locale} width={MEASURE} height={150} months />
      </RewindFigure>
      <p className="italic" style={{ fontSize: u(14.5), lineHeight: 1.25, marginTop: u(4) }}>
        Every line is a day you pressed play.{finalCut ? "" : " December is still being written."}
      </p>
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(36), lineHeight: 1.02, marginTop: u(14), letterSpacing: "-0.01em" }}>
        <CopyText text={headline("cover", facts)} source={source} />
      </h2>
      <ol className="border-t-[1.5px] border-current" style={{ marginTop: u(14) }} data-testid="rewind-cover-lines">
        {coverLines(issue.pages).map((line) => (
          <li key={line.folio} className="rw-cover-line flex items-baseline border-b border-current/40" style={{ gap: u(12), padding: `${u(7)} 0`, fontSize: u(17), lineHeight: 1.2 }}>
            <b className="font-display tabular-nums" style={{ fontVariationSettings: axes(75, 900), minWidth: u(22) }}>
              {String(line.folio).padStart(2, "0")}
            </b>
            <span>{line.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto font-display" style={{ paddingTop: u(12) }}>
        <CoverCuts full={full} pocket={pocket} />
      </div>
    </div>
  )
}
