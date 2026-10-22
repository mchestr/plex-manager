import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton } from "@/components/ui/skeleton"

/** One settings section: its title, description and three fields. */
function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-72 max-w-full" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}

/** The settings page while it loads: the section nav and two sections. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-settings-loading">
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 lg:flex">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <SectionSkeleton />
          <SectionSkeleton />
        </div>
      </div>
    </AdminLoading>
  )
}
