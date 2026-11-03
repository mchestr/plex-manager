import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { TableSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <AdminLoading data-testid="admin-invites-loading">
      <TableSkeleton rows={8} columns={6} />
    </AdminLoading>
  )
}
