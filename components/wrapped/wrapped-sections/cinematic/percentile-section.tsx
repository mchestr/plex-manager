"use client"

import { motion } from "framer-motion"

import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import type { PercentileResult } from "@/lib/wrapped/derived-statistics"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicPercentileSection({ section }: Props) {
  const data = (section.data || {}) as {
    percentile?: PercentileResult
    serverName?: string
  }
  const percentile = data.percentile

  return (
    <SlideFrame eyebrow="Among the Audience" title={section.title} narrative={section.content}>
      {percentile && (
        <div className="space-y-6 pt-2">
          <motion.p
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 1.4, type: "spring", stiffness: 90 }}
            className="font-serif text-6xl sm:text-8xl bg-gradient-to-b from-gold-bright to-gold bg-clip-text text-transparent"
          >
            {percentile.topPercentLabel}
          </motion.p>
          <div className="max-w-md mx-auto space-y-2">
            <div className="h-2 rounded-full bg-ivory/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-gold to-gold-bright"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(100 - percentile.percentile, 4)}%` }}
                transition={{ duration: 1.6, delay: 1.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <p className="text-xs sm:text-sm text-taupe uppercase tracking-[0.25em]">
              of all viewers{data.serverName ? ` on ${data.serverName}` : " on this server"}
            </p>
          </div>
        </div>
      )}
    </SlideFrame>
  )
}
