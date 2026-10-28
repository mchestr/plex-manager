import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The watchlist page while it loads: the settings card, the figures and the table. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-watchlist-loading">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <StatGridSkeleton count={4} />
      <TableSkeleton rows={8} columns={6} />
    </AdminLoading>
  )
}
