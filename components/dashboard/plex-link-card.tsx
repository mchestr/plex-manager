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
      className="group relative block overflow-hidden rounded-2xl border border-[#e5a00d]/20 bg-gradient-to-br from-[#1f1f1f] via-[#282828] to-[#1a1a1a] p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-[#e5a00d]/40 hover:shadow-[#e5a00d]/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="plex-link-card"
    >
      {/* Ambient glow effect */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#e5a00d]/10 blur-3xl transition-all duration-500 group-hover:bg-[#e5a00d]/20" />

      <div className="relative flex items-center gap-4">
        {/* Plex Logo */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e5a00d] to-[#cc8c00] shadow-lg shadow-[#e5a00d]/20">
          <svg
            className="h-8 w-8 text-black"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-white">
            Plex
          </h3>
          <p className="mt-0.5 text-sm text-slate-400">
            Access {serverName}
          </p>
        </div>

        {/* Arrow indicator */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition-all duration-200 group-hover:bg-[#e5a00d]/20 group-hover:text-[#e5a00d]">
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
