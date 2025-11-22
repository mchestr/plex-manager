import { InviteDetailsClient } from "@/components/admin/invites/invite-details-client"
import AdminLayoutClient from "@/components/admin/shared/admin-layout-client"
import { requireAdmin } from "@/lib/admin"

export const dynamic = 'force-dynamic'

export default async function InviteDetailsPage({ params }: { params: { id: string } }) {
  await requireAdmin()

  return (
    <AdminLayoutClient>
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <InviteDetailsClient id={params.id} />
        </div>
      </div>
    </AdminLayoutClient>
  )
}
