"use client"

import { motion } from "framer-motion"

interface RequestsCardProps {
  url: string
}

export function RequestsCard({ url }: RequestsCardProps) {
  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/50 via-slate-900 to-slate-900 p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-purple-500/40 hover:shadow-purple-500/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="requests-card"
    >
      {/* Ambient glow effect */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl transition-all duration-500 group-hover:bg-purple-500/20" />

      <div className="relative flex items-center gap-4">
        {/* Overseerr-style icon */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 shadow-lg shadow-purple-500/20">
          <svg
            className="h-7 w-7 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 4V2m0 2a2 2 0 012 2v1a2 2 0 01-2 2 2 2 0 01-2-2V6a2 2 0 012-2zm0 8v2m0-2a2 2 0 00-2 2v1a2 2 0 002 2 2 2 0 002-2v-1a2 2 0 00-2-2zm10-8V2m0 2a2 2 0 012 2v1a2 2 0 01-2 2 2 2 0 01-2-2V6a2 2 0 012-2zm0 8v2m0-2a2 2 0 00-2 2v1a2 2 0 002 2 2 2 0 002-2v-1a2 2 0 00-2-2z"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-white">
            Requests
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">
            Request movies & shows
          </p>
        </div>

        {/* Arrow indicator */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition-all duration-200 group-hover:bg-purple-500/20 group-hover:text-purple-400">
          <svg
            className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </div>
    </motion.a>
  )
}
