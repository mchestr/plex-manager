/**
 * Which announcements are new to a member (UI-25): those created after
 * `User.announcementsSeenAt`, which `markAnnouncementsSeen` moves forward.
 *
 * @module lib/member/announcements
 */

/** Whether an announcement posted at `createdAt` carries the "New" pip. */
export function isNewAnnouncement(createdAt: string | Date, seenAt: Date | null): boolean {
  return seenAt === null || new Date(createdAt).getTime() > seenAt.getTime()
}

/** The newest `createdAt` on screen, for `MarkAnnouncementsSeen`; null for none. */
export function newestCreatedAt(announcements: ReadonlyArray<{ createdAt: string }>): string | null {
  let newest: string | null = null
  for (const { createdAt } of announcements) {
    if (newest === null || new Date(createdAt).getTime() > new Date(newest).getTime()) newest = createdAt
  }
  return newest
}
