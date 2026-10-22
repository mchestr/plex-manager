import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { TableSkeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <AdminLoading>
      <TableSkeleton rows={6} columns={4} />
    </AdminLoading>
  )
}
