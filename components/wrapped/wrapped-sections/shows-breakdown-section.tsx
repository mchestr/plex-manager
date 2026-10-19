"use client"

import { motion, useReducedMotion } from "motion/react"
import { loop } from "@/lib/utils/motion-loop"
import { CountUp } from "@/components/ui/count-up"
import { FormattedText } from "@/components/shared/formatted-text"
import { SectionHeader } from "@/components/wrapped/wrapped-sections/section-header"
import { formatWatchTime } from "@/components/wrapped/wrapped-sections/utils"
import { WrappedData, WrappedSection } from "@/types/wrapped"

interface ShowsBreakdownSectionProps {
  section: WrappedSection
  wrappedData: WrappedData
  sectionIndex: number
}

export function ShowsBreakdownSection({ section, wrappedData, sectionIndex }: ShowsBreakdownSectionProps) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="text-center space-y-6">
      <SectionHeader title={section.title} />
      <motion.div
        initial={{ opacity: 0, scale: 0.7, rotate: -5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{
          duration: 0.8,
          delay: 0.3,
          type: "spring",
          stiffness: 120
        }}
        whileHover={{ scale: 1.02 }}
        className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-8 max-w-2xl mx-auto relative overflow-hidden"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent"
          {...loop(
            reduceMotion,
            {
              opacity: [0.3, 0.6, 0.3],
            },
            {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }
          )}
        />
        <div className="relative text-5xl font-bold text-purple-400 mb-4" key={`shows-${sectionIndex}`}>
          <CountUp key={`${sectionIndex}-shows`} value={wrappedData.statistics.showsWatched} duration={2} delay={0.5} />
        </div>
        <div className="relative text-xl text-slate-300 mb-4">Shows Watched</div>
        <div className="relative text-lg text-slate-400">
          {formatWatchTime(wrappedData.statistics.totalWatchTime.shows)} of show content
        </div>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="text-lg text-slate-300 max-w-2xl mx-auto"
      >
        <FormattedText text={section.content} />
      </motion.p>
    </div>
  )
}

