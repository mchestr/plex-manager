import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The Problem reports tab while it loads: the filter, the list and the settings card. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-problem-reports-loading">
      <Skeleton className="h-7 w-96 max-w-full" />
      <TableSkeleton rows={5} columns={5} />
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </AdminLoading>
  )
}
