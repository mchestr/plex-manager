import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The audit log while it loads: the date and event filters, then the table. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-audit-loading">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-9 w-96 max-w-full" />
      </div>
      <TableSkeleton rows={8} columns={5} />
    </AdminLoading>
  )
}
