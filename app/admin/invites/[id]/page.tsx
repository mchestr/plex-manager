import { InviteDetailsClient } from "@/components/admin/invites/invite-details-client"

export const dynamic = 'force-dynamic'

export default async function InviteDetailsPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <InviteDetailsClient id={params.id} />
      </div>
    </div>
  )
}
