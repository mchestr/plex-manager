import { requireAdmin } from "@/lib/admin"
import AdminLayoutClient from "@/components/admin/shared/admin-layout-client"
import { InvitesPageClient } from "@/components/admin/invites/invites-page-client"

export const dynamic = 'force-dynamic'

export default async function InvitesPage() {
  await requireAdmin()

  return (
    <AdminLayoutClient>
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <InvitesPageClient />
        </div>
      </div>
    </AdminLayoutClient>
  )
}
