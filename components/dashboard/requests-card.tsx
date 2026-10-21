"use client"

import { motion } from "motion/react"
import { safeHref } from "@/lib/ui/markdown"

interface RequestsCardProps {
  url: string
}

export function RequestsCard({ url }: RequestsCardProps) {
  const href = safeHref(url)
  if (!href) return null
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4 transition-colors duration-300 hover:bg-accent"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid="requests-card"
    >
      {/* Overseerr-style icon */}
      <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <svg
          className="h-5 w-5 sm:h-6 sm:w-6 text-foreground"
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

      <span className="relative text-base sm:text-lg font-semibold text-foreground">
        Requests
      </span>
      {/* Arrow indicator */}
      <svg
        className="ml-auto h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5"
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
