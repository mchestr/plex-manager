import type { Metadata, Route } from "next"
import { notFound, redirect } from "next/navigation"

import { ReportList } from "@/components/problem-reports/report-list"
import { ReportSearch } from "@/components/problem-reports/report-search"
import { ReportSheet } from "@/components/problem-reports/report-sheet"
import { TitleList } from "@/components/problem-reports/title-list"
import { Alert } from "@/components/ui/alert"
import { getSession } from "@/lib/data/session"
import { getReportPageData } from "@/lib/member/problem-reports"
import { listMemberReports, type ReportRow } from "@/lib/member/your-reports"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { reportSearchParamsSchema } from "@/lib/validations/problem-reports"

export const metadata: Metadata = { title: "Report a problem" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1 text-foreground">Report a problem</h1>
      <p className="text-ui text-muted-foreground">Tell the server admin about a title that won't play right, looks wrong or is missing episodes.</p>
    </div>
  )
}

function YourReports({ reports }: { reports: ReportRow[] }) {
  return (
    <section aria-labelledby="report-yours-title" className="flex flex-col gap-3" data-testid="report-yours">
      <h2 id="report-yours-title" className="text-h2 text-foreground">
        Your reports
      </h2>
      <ReportList rows={reports} />
    </section>
  )
}

/** While the switch is off: only the member's reports, which they can still cancel. */
function SwitchedOff({ reports }: { reports: ReportRow[] }) {
  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-8">
        <Header />
        <Alert tone="info" data-testid="report-off">
          Reporting problems is off right now. Your reports stay here, and you can still cancel one.
        </Alert>
        <YourReports reports={reports} />
      </div>
    </div>
  )
}

/**
 * Report a problem with a title (docs/problem-reports.md), top to bottom:
 * Watching now (only while the member streams), Find a title, Recently
 * watched, and Your reports. A title opens its sheet (`?item=`). While the
 * switch is off, only Your reports, for a member who has some.
 */
export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession()
  if (!session?.user?.id) redirect("/")
  if (!(await getProblemReportSettings()).enabled) {
    const reports = await listMemberReports(session.user.id)
    if (reports.length === 0) notFound()
    return <SwitchedOff reports={reports} />
  }

  const raw = await searchParams
  const params = reportSearchParamsSchema.parse({ q: first(raw.q), item: first(raw.item) })
  const data = await getReportPageData(session.user.id, params)
  const query = params.q ?? ""
  const closeHref = (query ? `/report?q=${encodeURIComponent(query)}` : "/report") as Route

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-8">
        <Header />
        {data.watching && data.watching.length > 0 && (
          <section aria-labelledby="report-watching-title" className="flex flex-col gap-3" data-testid="report-watching">
            <h2 id="report-watching-title" className="text-h2 text-foreground">
              Watching now
            </h2>
            <TitleList titles={data.watching} query={query} testId="report-watching-title" />
          </section>
        )}
        <ReportSearch query={query} search={data.search} />
        <section aria-labelledby="report-recent-title" className="flex flex-col gap-3" data-testid="report-recent">
          <h2 id="report-recent-title" className="text-h2 text-foreground">
            Recently watched
          </h2>
          {data.recent === null ? (
            <p className="text-ui text-muted-foreground" data-testid="report-recent-unavailable">
              We can't load what you watched recently right now. Find the title above instead.
            </p>
          ) : data.recent.length === 0 ? (
            <p className="text-ui text-muted-foreground" data-testid="report-recent-empty">
              Nothing you watched recently is in your libraries.
            </p>
          ) : (
            <TitleList titles={data.recent} query={query} testId="report-recent-title" />
          )}
        </section>
        <YourReports reports={data.reports} />
        {data.selected && <ReportSheet key={params.item} selected={data.selected} closeHref={closeHref} />}
      </div>
    </div>
  )
}
