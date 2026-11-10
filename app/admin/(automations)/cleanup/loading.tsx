import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeleton"

/** Media cleanup while it loads: the page tabs, the four tiles of the Rules tab and two rule cards. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-cleanup-loading">
      <div className="flex gap-4 border-b pb-3" data-slot="cleanup-tabs-skeleton">
        {["w-12", "w-24", "w-32", "w-14", "w-16"].map((width) => (
          <Skeleton key={width} className={`h-5 ${width}`} />
        ))}
      </div>
      <StatGridSkeleton count={4} />
      {[0, 1].map((card) => (
        <div key={card} className="flex flex-col gap-4 rounded-lg border bg-card p-5" data-slot="rule-card-skeleton">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-4 w-full max-w-2xl" />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((poster) => (
              <Skeleton key={poster} className="aspect-[2/3] w-12" />
            ))}
          </div>
        </div>
      ))}
    </AdminLoading>
  )
}
