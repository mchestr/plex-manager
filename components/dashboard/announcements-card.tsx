"use client"

import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import Link from "next/link"
import type { AnnouncementData } from "@/actions/announcements"
import { MarkdownBody } from "@/components/ui/markdown-body"
import { loop } from "@/lib/utils/motion-loop"
import { useFormat } from "@/lib/format-context"

interface AnnouncementsCardProps {
  announcements: AnnouncementData[]
  /** The server clock at render time, so the relative dates hydrate unchanged. */
  now: string
}

export function AnnouncementsCard({ announcements, now }: AnnouncementsCardProps) {
  const reduceMotion = useReducedMotion()
  const f = useFormat()
  if (announcements.length === 0) {
    return null
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl sm:rounded-2xl"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      data-testid="announcements-card"
    >
      {/* Animated gradient border */}
      <div
        className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 opacity-80"
        style={{
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 3s ease infinite',
        }}
      />

      {/* Inner content */}
      <div className="relative m-[1px] rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-950/90 via-slate-900 to-slate-900">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-orange-500/10 blur-2xl" />

        {/* Header */}
        <div className="relative flex items-center gap-3 border-b border-amber-500/20 px-4 sm:px-5 py-3 sm:py-4">
          {/* Animated bell icon */}
          <motion.div
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30"
            {...loop(reduceMotion, { rotate: [0, -10, 10, -10, 0] }, { duration: 0.5, repeat: Infinity, repeatDelay: 3 })}
          >
            <svg className="h-5 w-5 sm:h-5 sm:w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </motion.div>

          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-bold text-white">Announcements</h3>
            <p className="text-xs text-amber-200/70">Important updates from the server</p>
          </div>

          {announcements.length > 1 && (
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-300">
              {announcements.length}
            </span>
          )}
          <Link
            href="/announcements"
            className="rounded-sm text-ui font-medium text-foreground underline-offset-4 hover:underline"
            data-testid="announcements-view-all"
          >
            View all
          </Link>
        </div>

        {/* Announcements list */}
        <div className="relative max-h-48 sm:max-h-56 overflow-y-auto">
          <AnimatePresence>
            {announcements.map((announcement, index) => (
              <motion.article
                key={announcement.id}
                className="border-b border-white/5 px-4 sm:px-5 py-3 sm:py-4 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                data-testid={`announcement-${announcement.id}`}
              >
                <div className="flex items-start gap-3">
                  {/* Glowing dot indicator */}
                  <div className="relative mt-1.5 shrink-0">
                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-50 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm sm:text-base font-semibold text-white">{announcement.title}</h4>
                    <MarkdownBody className="mt-1.5 text-xs sm:text-sm text-slate-300 [--typeset-flow:0.5em]">
                      {announcement.content}
                    </MarkdownBody>
                    <p className="mt-2 text-xs text-amber-300/60 font-medium">
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
