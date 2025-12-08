import { getAllAnnouncements } from "@/actions/announcements"
import { AnnouncementsPageClient } from "@/components/admin/announcements/announcements-page-client"

export const dynamic = "force-dynamic"

export default async function AnnouncementsPage() {
  const announcements = await getAllAnnouncements()

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <AnnouncementsPageClient initialAnnouncements={announcements} />
      </div>
    </div>
  )
}
