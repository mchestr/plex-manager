"use client"

import { motion, AnimatePresence } from "motion/react"
import type { AnnouncementData } from "@/actions/announcements"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { useFormat } from "@/lib/format-context"

interface AnnouncementsCardProps {
  announcements: AnnouncementData[]
  /** The server clock at render time, so the relative dates hydrate unchanged. */
  now: string
}

export function AnnouncementsCard({ announcements, now }: AnnouncementsCardProps) {
  const f = useFormat()
  if (announcements.length === 0) {
    return null
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-card"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      data-testid="announcements-card"
    >
      <div>
        {/* Header */}
        <div className="relative flex items-center gap-3 border-b border-border px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-secondary">
            <svg className="h-5 w-5 sm:h-5 sm:w-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-foreground">Announcements</h3>
              <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground">
                New
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Important updates from the server</p>
          </div>

          {announcements.length > 1 && (
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
              {announcements.length}
            </span>
          )}
        </div>

        {/* Announcements list */}
        <div className="relative max-h-48 sm:max-h-56 overflow-y-auto">
          <AnimatePresence>
            {announcements.map((announcement, index) => (
              <motion.article
                key={announcement.id}
                className="border-b border-border px-4 sm:px-5 py-3 sm:py-4 last:border-b-0"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                data-testid={`announcement-${announcement.id}`}
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm sm:text-base font-semibold text-foreground">{announcement.title}</h4>
                    <MarkdownBody className="mt-1.5 text-xs sm:text-sm text-foreground [--typeset-flow:0.5em]">
                      {announcement.content}
                    </MarkdownBody>
                    <p className="mt-2 text-xs text-muted-foreground font-medium">
                      {capitalize(f.relative(announcement.createdAt, now))}
                    </p>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

// "yesterday" starts the line, so it reads "Yesterday".
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
