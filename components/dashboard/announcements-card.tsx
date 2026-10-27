import Link from "next/link"

import type { AnnouncementData } from "@/actions/announcements"
import { MarkAnnouncementsSeen } from "@/components/announcements/mark-announcements-seen"
import { NewPip } from "@/components/announcements/new-pip"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { Time } from "@/components/ui/time"
import { isNewAnnouncement, newestCreatedAt } from "@/lib/member/announcements"

interface AnnouncementsCardProps {
  /** The announcements to show, already limited to home's three. */
  announcements: AnnouncementData[]
  /** `User.announcementsSeenAt`: anything created later carries the "New" pip. */
  seenAt: Date | null
}

/**
 * Home's announcements (UI-25): each one in full through `MarkdownBody`, with
 * no clipped scroll box, and a "New" pip on those posted since the member
 * last looked. The pips stay for this view; `MarkAnnouncementsSeen` clears
 * them for the next one.
 */
export function AnnouncementsCard({ announcements, seenAt }: AnnouncementsCardProps) {
  if (announcements.length === 0) return null

  return (
    <Card aria-labelledby="home-announcements-title" role="region" data-testid="announcements-card">
      <CardHeader className="pb-3">
        <CardTitle as="h2" id="home-announcements-title">
          Announcements
        </CardTitle>
        <CardAction>
          <Link
            href="/announcements"
            className="rounded-sm text-caption text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground"
            data-testid="announcements-view-all"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      {/* Not a list: an announcement's own Markdown list would nest in it and read as a sub-list */}
      <div className="flex flex-col">
        {announcements.map((announcement) => {
          const titleId = `home-announcement-${announcement.id}-title`
          return (
            <article
              key={announcement.id}
              aria-labelledby={titleId}
              className="border-t px-5 pt-3.5 pb-4 first:border-t-0 first:pt-0.5"
              data-testid={`announcement-${announcement.id}`}
            >
              <div className="flex items-center gap-2.5">
                {isNewAnnouncement(announcement.createdAt, seenAt) && (
                  <NewPip data-testid={`announcement-${announcement.id}-new`} />
                )}
                <h3 id={titleId} className="min-w-0 text-ui font-semibold text-foreground wrap-anywhere">
                  {announcement.title}
                </h3>
                <Time
                  value={announcement.createdAt}
                  className="ml-auto shrink-0 text-caption whitespace-nowrap text-muted-foreground"
                />
              </div>
              <MarkdownBody className="mt-1.5 text-ui text-muted-foreground [--typeset-flow:0.5em]">
                {announcement.content}
              </MarkdownBody>
            </article>
          )
        })}
      </div>
      <MarkAnnouncementsSeen through={newestCreatedAt(announcements)} />
    </Card>
  )
}
