import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { Skeleton } from "@/components/ui/skeleton"

function CardShape({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full max-w-md" />
      ))}
    </div>
  )
}

/** The turn-on page while its review loads: the cards on the left and the two cards of the right column from `lg`. */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-cleanup-turn-on-loading">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="flex flex-col gap-4">
          <CardShape lines={3} />
          <CardShape lines={2} />
          <CardShape lines={4} />
        </div>
        <div className="flex flex-col gap-4">
          <CardShape lines={5} />
          <CardShape lines={3} />
        </div>
      </div>
    </AdminLoading>
  )
}
