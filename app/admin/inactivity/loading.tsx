import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The inactive members page while it loads: the settings card, the preview and the runs. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-inactivity-loading">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <TableSkeleton rows={5} columns={4} />
      <TableSkeleton rows={5} columns={7} />
    </AdminLoading>
  )
}
