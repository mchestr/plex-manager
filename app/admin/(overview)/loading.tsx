import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { StatGridSkeleton } from "@/components/ui/skeleton"

/** The Overview's loader: the header bars and four tiles (other admin pages keep `app/admin/loading.tsx`). */
export default function Loading() {
  return (
    <AdminLoading data-testid="admin-overview-loading">
      <StatGridSkeleton count={4} />
    </AdminLoading>
  )
}
