import { PageHeader } from "@/components/ui/page-header"
import { assertPermission } from "@/lib/admin"

/** Placeholder: the audit log page (replaced by the audit viewer track). */
export default async function AuditLogPage() {
  await assertPermission("audit:read")
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-audit-page">
      <PageHeader title="Audit log" data-testid="admin-audit-header" />
    </div>
  )
}
