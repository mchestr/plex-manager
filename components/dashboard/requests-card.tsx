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
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-950/50 via-slate-900 to-slate-900 p-3 sm:p-4 shadow-lg shadow-black/20 transition-all duration-300 hover:border-purple-500/40 hover:shadow-purple-500/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="requests-card"
    >
      {/* Ambient glow effect */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-purple-500/10 blur-2xl transition-all duration-500 group-hover:bg-purple-500/20" />

      {/* Overseerr-style icon */}
      <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 shadow-md shadow-purple-500/20">
        <svg
          className="h-5 w-5 sm:h-6 sm:w-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      </div>

      <span className="relative text-base sm:text-lg font-semibold text-white">
        Requests
      </span>

      {/* Arrow indicator */}
      <svg
        className="ml-auto h-4 w-4 text-slate-500 transition-all duration-200 group-hover:text-purple-400 group-hover:translate-x-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </motion.a>
  )
}
