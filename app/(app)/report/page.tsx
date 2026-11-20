import type { Metadata, Route } from "next"
import { notFound, redirect } from "next/navigation"

import { ReportList } from "@/components/problem-reports/report-list"
import { ReportSearch } from "@/components/problem-reports/report-search"
import { ReportSheet } from "@/components/problem-reports/report-sheet"
import { getSession } from "@/lib/data/session"
import { getReportPageData } from "@/lib/member/problem-reports"
import { hasReportPage } from "@/lib/problem-reports/settings"
import { reportSearchParamsSchema } from "@/lib/validations/problem-reports"

export const metadata: Metadata = { title: "Report a problem" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/**
 * Report a problem with a title (docs/problem-reports.md): find a title in
 * the member's libraries, open its sheet (`?item=`), and follow your reports.
 * A 404 while the switch is off.
 */
export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession()
  if (!session?.user?.id) redirect("/")
  if (!(await hasReportPage())) notFound()

  const raw = await searchParams
  const params = reportSearchParamsSchema.parse({ q: first(raw.q), item: first(raw.item) })
  const data = await getReportPageData(session.user.id, params)
  const query = params.q ?? ""
  const closeHref = (query ? `/report?q=${encodeURIComponent(query)}` : "/report") as Route

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-foreground">Report a problem</h1>
          <p className="text-ui text-muted-foreground">Tell the server admin about a title that won't play right, looks wrong or is missing episodes.</p>
        </div>
        <ReportSearch query={query} search={data.search} />
        <section aria-labelledby="report-yours-title" className="flex flex-col gap-3" data-testid="report-yours">
          <h2 id="report-yours-title" className="text-h2 text-foreground">
            Your reports
          </h2>
          <ReportList rows={data.reports} />
        </section>
        {data.selected && <ReportSheet key={params.item} selected={data.selected} closeHref={closeHref} />}
      </div>
    </div>
  )
}
