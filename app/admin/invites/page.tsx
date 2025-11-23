import { InvitesPageClient } from "@/components/admin/invites/invites-page-client"

export const dynamic = 'force-dynamic'

export default async function InvitesPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <InvitesPageClient />
      </div>
    </div>
  )
}
