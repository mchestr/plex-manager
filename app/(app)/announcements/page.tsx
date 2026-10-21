import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { getActiveAnnouncements } from "@/actions/announcements"
import { MarkAnnouncementsSeen } from "@/components/announcements/mark-announcements-seen"
import { NewPip } from "@/components/announcements/new-pip"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { Time } from "@/components/ui/time"
import { authOptions } from "@/lib/auth"
import { isNewAnnouncement, newestCreatedAt } from "@/lib/member/announcements"
import { prisma } from "@/lib/prisma"
import { icons } from "@/lib/ui/icons"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Announcements" }

/**
 * Every active announcement (UI-25), by priority then newest, each with its
 * own heading and the full Markdown body, never clipped. Announcements posted
 * since the member last looked carry the "New" pip for this view.
 */
export default async function AnnouncementsPage() {
  const session = await getServerSession(authOptions)
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
              description="News from the server shows here when it is posted."
              data-testid="announcements-empty"
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4" data-testid="announcements-list">
            {announcements.map((announcement) => {
              const titleId = `announcement-${announcement.id}-title`
              return (
                <Card key={announcement.id}>
                  <CardContent className="p-6">
                    <article
                      aria-labelledby={titleId}
                      className="flex flex-col gap-3"
                      data-testid={`announcement-${announcement.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {isNewAnnouncement(announcement.createdAt, seenAt) && (
                          <NewPip data-testid={`announcement-${announcement.id}-new`} />
                        )}
                        <h2 id={titleId} className="text-h3 text-foreground">
                          {announcement.title}
                        </h2>
                      </div>
                      <Time value={announcement.createdAt} className="text-caption text-muted-foreground" />
                      <MarkdownBody className="text-ui text-foreground">{announcement.content}</MarkdownBody>
                    </article>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
      <MarkAnnouncementsSeen through={newestCreatedAt(announcements)} />
    </div>
  )
}
