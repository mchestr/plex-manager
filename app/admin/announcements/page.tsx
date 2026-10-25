import { notFound } from "next/navigation"

import { AnnouncementsManager } from "@/components/admin/announcements/announcements-manager"
import { getAdminGate } from "@/lib/admin"
import { listAnnouncements } from "@/lib/admin/announcements"
import { serverZone } from "@/lib/utils/server-zone"

/** `/admin/announcements` (P10.5): every announcement, read on the server. */
export default async function AnnouncementsPage() {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const [rows, zone] = await Promise.all([listAnnouncements(), serverZone()])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6" data-testid="admin-announcements-page">
      <AnnouncementsManager rows={rows} zone={zone} />
    </div>
  )
}
