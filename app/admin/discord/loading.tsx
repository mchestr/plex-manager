import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeleton"

/** The Discord page while it loads: the bot's tiles, the activity chart and recent commands. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-discord-loading">
      <StatGridSkeleton count={4} />
      <Skeleton className="h-64 w-full rounded-lg" />
      <TableSkeleton rows={5} columns={4} />
    </AdminLoading>
  )
}
