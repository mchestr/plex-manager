"use client"

import { motion } from "framer-motion"

import { formatWatchTime } from "@/lib/utils/time-formatting"

export interface BillingEntry {
  title: string
  year?: number
  watchTime: number
  episodesWatched?: number
}

interface TopBillingListProps {
  entries: BillingEntry[]
}

/**
 * A marquee-style ranked list: the #1 title gets top billing in large gold
 * serif; the rest follow as a quiet playbill.
 */
export function TopBillingList({ entries }: TopBillingListProps) {
  if (entries.length === 0) return null
  const [headliner, ...rest] = entries

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 1.4 }}
        className="border-y border-gold/30 py-5"
      >
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-taupe mb-2">
          Headlining
        </p>
        <p className="font-serif text-2xl sm:text-4xl text-gold-bright uppercase tracking-wide">
          {headliner.title}
        </p>
        <p className="text-xs sm:text-sm text-taupe mt-2 uppercase tracking-[0.2em]">
          {headliner.year ? `${headliner.year} · ` : ""}
          {formatWatchTime(headliner.watchTime)}
          {headliner.episodesWatched ? ` · ${headliner.episodesWatched} episodes` : ""}
        </p>
      </motion.div>

      {rest.length > 0 && (
        <ol className="space-y-2 text-left">
          {rest.map((entry, idx) => (
            <motion.li
              key={entry.title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1.9 + idx * 0.15 }}
              className="flex items-baseline gap-4 border-b border-ivory/10 pb-2"
            >
              <span className="font-serif text-gold text-lg sm:text-xl tabular-nums w-6 text-right">
                {idx + 2}
              </span>
              <span className="flex-1 text-ivory text-base sm:text-lg truncate">
                {entry.title}
                {entry.year ? <span className="text-taupe text-sm"> ({entry.year})</span> : null}
              </span>
              <span className="text-taupe text-xs sm:text-sm whitespace-nowrap">
                {formatWatchTime(entry.watchTime)}
                {entry.episodesWatched ? ` · ${entry.episodesWatched} ep` : ""}
              </span>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  )
}
