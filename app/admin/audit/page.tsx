import { AuditScope } from "@/components/admin/audit/audit-scope"
import { AuditTable } from "@/components/admin/audit/audit-table"
import { PageHeader } from "@/components/ui/page-header"
import { assertPermission } from "@/lib/admin"
import { hasAuditFilters, parseAuditFilters } from "@/lib/audit/filters"
import { getAuditLogPage } from "@/lib/data/audit-log"
import { getFormat } from "@/lib/settings/app-settings"
import { parseTableParams } from "@/lib/ui/table-params"

type Params = Record<string, string | string[] | undefined>

/**
 * The audit log, under System, for admins and Support: every audited event,
 * newest first. The dates, category, event, person, member, run and page come
 * from the URL; the rows load here, and an event opens on its own page.
 */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Params> }) {
  await assertPermission("audit:read")
  const [params, f] = await Promise.all([searchParams, getFormat()])
  const filters = parseAuditFilters(params)
  const table = parseTableParams(params, { sortable: [], defaultSort: { id: "time", desc: true } })
  const { rows, total, page, scope } = await getAuditLogPage(filters, { page: table.page, pageSize: table.pageSize, f })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-audit-page">
      <PageHeader title="Audit log" description="Who did what, to whom and when." data-testid="admin-audit-header" />
      <AuditScope params={params} actor={scope.actor} member={scope.member} run={filters.run ?? null} />
      <AuditTable
        rows={rows}
        total={total}
        page={page}
        pageSize={table.pageSize}
        category={filters.category ?? null}
        type={filters.type ?? null}
        filtered={hasAuditFilters(filters)}
        zone={f.settings.timeZone}
      />
    </div>
  )
}
