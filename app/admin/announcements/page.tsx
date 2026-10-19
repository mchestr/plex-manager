import { getAllAnnouncements } from "@/actions/announcements"
import { AnnouncementsPageClient } from "@/components/admin/announcements/announcements-page-client"
import { serverZone } from "@/lib/utils/server-zone"

export const dynamic = "force-dynamic"

export default async function AnnouncementsPage() {
  const [announcements, zone] = await Promise.all([getAllAnnouncements(), serverZone()])

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <AnnouncementsPageClient initialAnnouncements={announcements} zone={zone} />
      </div>
    </div>
  )
}
