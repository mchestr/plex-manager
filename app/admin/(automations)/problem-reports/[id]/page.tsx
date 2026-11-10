import Link from "next/link"
import { notFound } from "next/navigation"

import { FixActions } from "@/components/admin/problem-reports/fix-actions"
import { ReportTimeline } from "@/components/admin/problem-reports/report-timeline"
import { ResolveActions } from "@/components/admin/problem-reports/resolve-actions"
import { DetailItem } from "@/components/admin/users/detail/detail-item"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { assertAdmin } from "@/lib/admin"
import { problemReports, userDetail } from "@/lib/admin/routes"
import { getProblemReport } from "@/lib/data/problem-reports"
import type { MediaType } from "@/lib/generated/prisma/client"
import { getFormat } from "@/lib/settings/app-settings"

const TYPE_LABELS: Record<MediaType, string> = { MOVIE: "Movie", TV_SERIES: "Show", EPISODE: "Episode" }

/** A note kept on the report, as plain text. */
function Note({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <DetailItem label={label}>
      <span className="whitespace-pre-wrap" data-testid={testId}>
        {text}
      </span>
    </DetailItem>
  )
}

/**
 * One problem report (docs/problem-reports.md): the title, the problem and
 * who reported it, then the timeline with each member's words and the
 * evidence. While it is open, the header offers the fixes (the problem's
 * own first, the rest under Other fixes), Close with a note and Mark fixed;
 * while a fix runs, the report says what it is doing. Members' words show as
 * plain text, never as Markdown.
 */
export default async function ProblemReportPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin()
  const [{ id }, f] = await Promise.all([params, getFormat()])
  const report = await getProblemReport(id)
  if (!report) notFound()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-problem-report-page">
      <PageHeader
        title={report.title}
        description={report.problem}
        breadcrumbs={[{ label: "Problem reports", href: problemReports() }, { label: report.title }]}
        meta={<StatusBadge domain="problemReport" value={report.status} data-testid="admin-problem-report-status" />}
        actions={
          report.open && (
            <>
              {report.fixes && <FixActions reportId={report.id} suggested={report.fixes.suggested} others={report.fixes.others} />}
              <ResolveActions reportId={report.id} />
            </>
          )
        }
        data-testid="admin-problem-report-header"
      />
      <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="admin-problem-report">
        <DetailItem label="Reported by">
          <Link href={userDetail(report.reporter.id)} className="w-fit rounded-sm font-medium hover:underline" data-testid="admin-problem-report-reporter">
            {report.reporter.name}
          </Link>
        </DetailItem>
        <DetailItem label="Reported" testId="admin-problem-report-created-timestamp">
          {f.dateTime(report.createdAt, { zoneLabel: true })}
        </DetailItem>
        <DetailItem label="Type">{TYPE_LABELS[report.mediaType]}</DetailItem>
        {report.running && (
          <DetailItem label="Fix" testId="admin-problem-report-running">
            {report.running}
          </DetailItem>
        )}
        {report.resolvedAt && (
          <DetailItem label={report.status === "FIXED" ? "Fixed" : "Closed"} testId="admin-problem-report-resolved-timestamp">
            {f.dateTime(report.resolvedAt, { zoneLabel: true })}
          </DetailItem>
        )}
        {report.note && <Note label="Their note" text={report.note} testId="admin-problem-report-note" />}
        {report.memberNote && <Note label="Your note to the member" text={report.memberNote} testId="admin-problem-report-member-note" />}
        {report.adminNote && <Note label="Internal note" text={report.adminNote} testId="admin-problem-report-admin-note" />}
      </dl>
      {report.plexHref && (
        <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<a href={report.plexHref} target="_blank" rel="noreferrer" />} data-testid="admin-problem-report-plex">
          Open in Plex
        </Button>
      )}
      <section aria-labelledby="admin-problem-report-timeline-heading" className="flex flex-col gap-3">
        <h2 id="admin-problem-report-timeline-heading" className="text-h3">
          Timeline
        </h2>
        <ReportTimeline steps={report.steps} f={f} />
      </section>
    </div>
  )
}
