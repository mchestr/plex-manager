import { AdminLoading } from "@/components/admin/shared/admin-loading"
import { TableSkeleton } from "@/components/ui/skeleton"

/**
 * The generic admin loader. The tabs of a section share its layout, so this
 * boundary does not suspend again when one tab replaces another: a tab page
 * without its own `loading.tsx` re-exports this one
 * (`app/admin/__tests__/tab-loading.test.ts` keeps every tab covered).
 */
export default function Loading() {
  return (
    <AdminLoading>
      <TableSkeleton rows={6} columns={4} />
    </AdminLoading>
  )
}
