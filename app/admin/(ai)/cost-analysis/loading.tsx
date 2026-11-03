import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"

/** Cost analysis while it loads: the totals, the chart and the breakdown table. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-cost-analysis-loading">
      <StatGridSkeleton count={4} />
      <Skeleton className="h-64 w-full rounded-lg" />
      <TableSkeleton rows={5} columns={4} />
    </AdminLoading>
  )
}
