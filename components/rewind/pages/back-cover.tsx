import { RewindFigure } from "@/components/rewind/a11y/figure"
import { billingBlock } from "@/lib/rewind/billing-block"
import { formatDayMonth } from "@/lib/rewind/format"
import { backCoverPage } from "@/lib/rewind/pages/back-cover"
import type { BackCoverData } from "@/lib/rewind/pages/back-cover.schema"
import { has, isFinalCut, shown } from "@/lib/rewind/pages/facts"
import { registry } from "@/lib/rewind/registry"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { copyLocals, headline } from "@/lib/wrapped/copy/templates"

import { BackCoverFooter, BackCoverShare } from "./back-cover-actions"
import { BillingBlock } from "./billing-block"
import { CopyText } from "./copy-text"
import type { IssueContext, PageProps } from "./issue-context"
import { SoundtrackStrip } from "./soundtrack-strip"
import { MEASURE, u, ut } from "./units"

const STRIP_H = 40

/** The one AI line (G7), or the template line when every word is a template. */
const backCoverDisclosure = (copySource: IssueContext["copySource"]) =>
  copySource === "template" ? "Every word here comes from a template." : "The numbers come from your history. Some of the words are written by AI."

/**
 * 18 Back cover (design 4.3, `slide-18-back-cover.png`): paper in the
 * archetype's deep ink (the stage sets it), "That was your 2026, Mike.", the
 * billing block of the member's eligible credits, the soundtrack, the AI
 * disclosure, "Share the poster" with the privacy line, the colophon and the
 * footer: "Read again", "Contents" and "Done". Nothing autoplays here. P8.4
 * adds "Save all {n} cards".
 */
export function BackCoverPage({ data, issue }: PageProps<BackCoverData>) {
  const { facts, locale } = issue
  const source = { ...facts, ...copyLocals({ year: issue.year }) }
  const block = billingBlock(facts, {
    serverName: issue.serverName,
    named: true,
    showtime: issue.pages.some((page) => page.type === "clock"),
    locale,
    measure: MEASURE,
    metrics: pageMetrics,
  })
  const from = String(facts["window.from"]?.value)
  const volume = [has(facts, "member.volume") && `Vol. ${shown(facts, "member.volume")}`, has(facts, "member.serial") && `No. ${shown(facts, "member.serial")}`].filter(Boolean)
  const signOff = issue.copy?.signOff

  return (
    <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)} 0` }} data-testid="rewind-page-back-cover">
      <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(42), lineHeight: 1.02, letterSpacing: "-0.01em" }}>
        <CopyText text={headline("back-cover", facts)} source={source} />
      </h2>
      <div className="border-y-[1.5px] border-current" style={{ marginTop: u(12), padding: `${u(10)} 0` }}>
        <BillingBlock lines={block.lines} entries={block.entries} />
      </div>
      <RewindFigure summary={backCoverPage.srSummary(data, facts)} className="mt-[calc(var(--u)*12px)]">
        <SoundtrackStrip minutes={data.minutes} from={from} locale={locale} width={MEASURE} height={STRIP_H} />
      </RewindFigure>
      <p className="italic" style={{ fontSize: ut(14), lineHeight: 1.25, marginTop: u(6) }}>
        {isFinalCut(facts)
          ? "One line per day, the whole year."
          : `One line per day. December is still being written; it joins in the final cut on ${formatDayMonth(`${issue.year + 1}-01-01`, { locale })}.`}
      </p>
      {signOff && (
        <p style={{ fontSize: u(17), lineHeight: 1.3, marginTop: u(8) }} data-testid="rewind-sign-off">
          <CopyText text={signOff} source={facts} />
        </p>
      )}
      <p style={{ fontSize: u(16), lineHeight: 1.3, marginTop: u(8) }} data-testid="rewind-back-cover-disclosure">
        {backCoverDisclosure(issue.copySource)}
      </p>
      <div style={{ marginTop: u(12) }}>
        <BackCoverShare />
      </div>
      <p className="text-center italic" style={{ fontSize: ut(13.5), lineHeight: 1.3, marginTop: u(10) }}>
        {[`${issue.serverName} Rewind ${issue.year}`, ...volume].join(", ")}
      </p>
      <div className="mt-auto">
        <BackCoverFooter pages={issue.pages.map((page) => ({ folio: page.folio, name: registry[page.type].name }))} returnTo={issue.returnTo} />
      </div>
    </div>
  )
}
