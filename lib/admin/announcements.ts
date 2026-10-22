import "server-only"

import { prisma } from "@/lib/prisma"

/** Active and showing; hidden by the admin; or past its expiry (which wins over hidden). */
type AnnouncementStatus = "active" | "hidden" | "expired"

export interface AdminAnnouncementRow {
  id: string
  title: string
  content: string
  priority: number
  isActive: boolean
  status: AnnouncementStatus
  createdAt: string
  expiresAt: string | null
}

/** @internal */
export function announcementStatus(isActive: boolean, expiresAt: Date | null, now: Date): AnnouncementStatus {
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired"
  return isActive ? "active" : "hidden"
}

/**
 * Every announcement for `/admin/announcements` (P10.5), hidden and expired
 * ones included, by priority then newest, the order home shows them in.
 * The page gates the admin; this module is `server-only`.
 */
export async function listAnnouncements(now = new Date()): Promise<AdminAnnouncementRow[]> {
  const rows = await prisma.announcement.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    select: { id: true, title: true, content: true, priority: true, isActive: true, createdAt: true, expiresAt: true },
  })
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    priority: row.priority,
    isActive: row.isActive,
    status: announcementStatus(row.isActive, row.expiresAt, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }))
}
