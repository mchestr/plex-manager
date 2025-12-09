"use client"

import { motion } from "framer-motion"

interface PlexLinkCardProps {
  serverName: string
}

export function PlexLinkCard({ serverName }: PlexLinkCardProps) {
  return (
    <motion.a
      href="https://plex.tv"
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-[#e5a00d]/20 bg-gradient-to-br from-[#1f1f1f] via-[#282828] to-[#1a1a1a] p-3 sm:p-4 shadow-lg shadow-black/20 transition-all duration-300 hover:border-[#e5a00d]/40 hover:shadow-[#e5a00d]/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="plex-link-card"
    >
      {/* Ambient glow effect */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#e5a00d]/10 blur-2xl transition-all duration-500 group-hover:bg-[#e5a00d]/20" />

      {/* Plex Logo */}
      <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#e5a00d] to-[#cc8c00] shadow-md shadow-[#e5a00d]/20">
        <svg
          className="h-5 w-5 sm:h-6 sm:w-6 text-black"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
        </svg>
      </div>

      <span className="relative text-base sm:text-lg font-semibold text-white">
        {serverName}
      </span>

      {/* Arrow indicator */}
      <svg
        className="ml-auto h-4 w-4 text-slate-500 transition-all duration-200 group-hover:text-[#e5a00d] group-hover:translate-x-0.5"
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
