import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { TableSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <AdminLoading data-testid="admin-affiliates-loading">
      <TableSkeleton rows={6} columns={6} />
    </AdminLoading>
  )
}
