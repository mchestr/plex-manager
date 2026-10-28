import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getActiveAnnouncements } from "@/actions/announcements"
import { MarkAnnouncementsSeen } from "@/components/announcements/mark-announcements-seen"
import { AnnouncementItem } from "@/components/announcements/announcement-item"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { isNewAnnouncement, newestCreatedAt } from "@/lib/member/announcements"
import { prisma } from "@/lib/prisma"
import { icons } from "@/lib/ui/icons"
import { getSession } from "@/lib/data/session"

export const metadata: Metadata = { title: "Announcements" }

/**
 * Every active announcement (UI-25), by priority then newest, each with its
 * own heading and the full Markdown body, never clipped. Announcements posted
 * since the member last looked carry the "New" pip for this view.
 */
export default async function AnnouncementsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect("/")

  const [result, user] = await Promise.all([
    getActiveAnnouncements(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { announcementsSeenAt: true } }),
  ])
  const announcements = result.success ? result.data : []
  const seenAt = user?.announcementsSeenAt ?? null

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-6">
        <h1 className="text-h1 text-foreground">Announcements</h1>

        {announcements.length === 0 ? (
          <Card>
            <EmptyState
              kind="first-use"
              icon={icons.announcements}
              title="No announcements yet"
              description="Announcements from the server owner show here."
              data-testid="announcements-empty"
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4" data-testid="announcements-list">
            {announcements.map((announcement) => (
              <Card key={announcement.id}>
                <CardContent>
                  <AnnouncementItem announcement={announcement} isNew={isNewAnnouncement(announcement.createdAt, seenAt)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <MarkAnnouncementsSeen through={newestCreatedAt(announcements)} />
    </div>
  )
}
