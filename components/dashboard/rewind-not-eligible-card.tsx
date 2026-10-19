"use client"

import { refusalCopy } from "@/lib/wrapped/generation-errors"
import { motion } from "motion/react"

interface RewindNotEligibleCardProps {
  /** The season year (`getWrappedSettings().wrappedYear`). */
  year: number
}

/**
 * The Rewind card for a member without Plex watch history (FR-48, RWP-08): an
 * explanation, with no Generate or View action.
 */
export function RewindNotEligibleCard({ year }: RewindNotEligibleCardProps) {
  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800/60 via-slate-900 to-slate-900 p-6 sm:p-8 shadow-xl shadow-black/30"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      data-testid="wrapped-card-not-eligible"
    >
      <div className="flex flex-col items-center text-center gap-2">
        <h3 className="text-xl font-bold text-white">Rewind {year}</h3>
        <p className="text-sm text-slate-400 max-w-xs">{refusalCopy("REWIND_NOT_ELIGIBLE")}</p>
      </div>
    </motion.div>
  )
}
