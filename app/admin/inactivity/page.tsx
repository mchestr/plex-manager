import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"

/** Placeholder: the inactive members page (replaced by the inactivity track). */
export default async function InactivityPage() {
  await assertAdmin()
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-inactivity-page">
      <PageHeader title="Inactive members" data-testid="admin-inactivity-header" />
    </div>
  )
}
