import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <AdminLoading data-testid="admin-llm-usage-loading">
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} columns={5} />
    </AdminLoading>
  )
}
