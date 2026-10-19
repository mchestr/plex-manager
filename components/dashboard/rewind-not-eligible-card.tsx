"use client"

import { refusalCopy } from "@/lib/wrapped/generation-errors"
import { motion } from "framer-motion"

interface RewindNotEligibleCardProps {
  /** The season year (`getWrappedSettings().wrappedYear`). */
  year: number
  /** Defaults to the FR-48 explanation; the FR-50 Redis message reuses the card. */
  message?: string
  testId?: string
}

/**
 * The Rewind card when no Rewind can be made: for a member without Plex watch
 * history (FR-48, RWP-08), or while Redis is missing or down (FR-50). An
 * explanation, with no Generate or View action.
 */
export function RewindNotEligibleCard({
  year,
  message = refusalCopy("REWIND_NOT_ELIGIBLE"),
  testId = "wrapped-card-not-eligible",
}: RewindNotEligibleCardProps) {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800/60 via-slate-900 to-slate-900 p-6 sm:p-8 shadow-xl shadow-black/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      data-testid={testId}
    >
      <div className="flex flex-col items-center text-center gap-2">
        <h3 className="text-xl font-bold text-white">Rewind {year}</h3>
        <p className="text-sm text-slate-400 max-w-xs">{message}</p>
      </div>
    </motion.div>
  )
}
