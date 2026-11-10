import { z } from "zod"

import { ProblemReportSettingsSection } from "@/components/admin/problem-reports/settings-section"
import { ProblemReportsTable } from "@/components/admin/problem-reports/reports-table"
import { LastSaved } from "@/components/admin/settings/last-saved"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { PROBLEM_REPORT_FILTERS } from "@/lib/admin/routes"
import { getProblemReportSettingsView, listProblemReports } from "@/lib/data/problem-reports"
import { parseTableParams } from "@/lib/ui/table-params"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const filterSchema = z.enum(PROBLEM_REPORT_FILTERS).catch("needs-you")

/**
 * Problem reports, the first tab of Automations (docs/problem-reports.md):
 * the reports by filter from `?status=` (Needs you first), each row opening
 * its report, then the settings card with the feature switch. Turning the
 * feature off keeps every report here.
 */
export default async function ProblemReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await assertAdmin()
  const raw = await searchParams
  const filter = filterSchema.parse(Array.isArray(raw.status) ? raw.status[0] : raw.status)
  // The order is the filter's own, so `?sort=` is never read
  const { page, pageSize } = parseTableParams(raw, { sortable: [], defaultSort: { id: "reported", desc: false } })
  const [list, settings] = await Promise.all([listProblemReports(filter, { page, pageSize }), getProblemReportSettingsView()])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-problem-reports-page">
      <PageHeader
        title="Problem reports"
        description="Titles members say won't play right, look wrong or are missing episodes. Mark one fixed, or close it with a note the member sees."
        data-testid="admin-problem-reports-header"
      />
      <ProblemReportsTable list={list} filter={filter} page={page} pageSize={pageSize} />
      <ProblemReportSettingsSection
        enabled={settings.enabled}
        footerMeta={settings.lastSaved && <LastSaved id="problem-reports" meta={settings.lastSaved} />}
      />
    </div>
  )
}
