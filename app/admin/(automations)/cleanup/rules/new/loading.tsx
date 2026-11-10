import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The new-rule editor while it loads: the builder, the preview card and Results. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-cleanup-editor-loading">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-72 max-w-full" />
        </div>
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
      <TableSkeleton rows={5} columns={6} />
    </AdminLoading>
  )
}
