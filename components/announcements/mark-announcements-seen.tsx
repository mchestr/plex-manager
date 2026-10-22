"use client"

import { useEffect } from "react"

import { markAnnouncementsSeen } from "@/actions/announcements-seen"

/**
 * Marks the announcements on screen as seen once the page has mounted. The
 * pips the server rendered stay for this view and clear on the next one.
 */
export function MarkAnnouncementsSeen({ through }: { through: string | null }) {
  // A real effect: the visit itself is the write, once the page has rendered
  useEffect(() => {
    if (through) void markAnnouncementsSeen({ through })
  }, [through])
  return null
}
