"use client"

import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"
import type { AnnouncementData } from "@/actions/announcements"

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  loading: () => <div className="h-4 w-24 animate-pulse rounded bg-slate-700" />,
})

interface AnnouncementsCardProps {
  announcements: AnnouncementData[]
}

export function AnnouncementsCard({ announcements }: AnnouncementsCardProps) {
  if (announcements.length === 0) {
    return (
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 p-6 shadow-xl shadow-black/20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        data-testid="announcements-card-empty"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700/50 text-slate-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Announcements</h3>
            <p className="text-sm text-slate-500">No announcements at this time</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 shadow-xl shadow-black/20"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      data-testid="announcements-card"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 text-cyan-400">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Announcements</h3>
        {announcements.length > 1 && (
          <span className="ml-auto rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-medium text-cyan-300">
            {announcements.length}
          </span>
        )}
      </div>

      {/* Announcements list */}
      <div className="max-h-64 overflow-y-auto">
        <AnimatePresence>
          {announcements.map((announcement, index) => (
            <motion.article
              key={announcement.id}
              className="border-b border-white/5 px-6 py-4 last:border-b-0"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              data-testid={`announcement-${announcement.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-white">{announcement.title}</h4>
                  <div className="mt-1 text-sm text-slate-300 prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline">
                    <ReactMarkdown>{announcement.content}</ReactMarkdown>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatRelativeDate(announcement.createdAt)}
                  </p>
                </div>
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return "Today"
  } else if (diffDays === 1) {
    return "Yesterday"
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    })
  }
}
