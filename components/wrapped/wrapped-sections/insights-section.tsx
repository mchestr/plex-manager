"use client"

import { motion } from "motion/react"
import { FormattedText } from "@/components/shared/formatted-text"
import { SectionHeader } from "@/components/wrapped/wrapped-sections/section-header"
import { WrappedData, WrappedSection } from "@/types/wrapped"

interface InsightsSectionProps {
  section: WrappedSection
  wrappedData: WrappedData
}

export function InsightsSection({ section, wrappedData }: InsightsSectionProps) {
  return (
    <div className="text-center space-y-6">
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <motion.div
        initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{
          duration: 0.8,
          delay: 0.3,
          type: "spring",
          stiffness: 100
        }}
        className="bg-gradient-to-r from-cyan-600/20 via-purple-600/20 to-pink-600/20 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-8 max-w-3xl mx-auto relative overflow-hidden"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-purple-500/20 to-pink-500/0"
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="relative text-3xl font-bold text-cyan-400 mb-4"
        >
          {wrappedData.insights.personality}
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="relative text-lg text-slate-300 mb-4"
        >
          <FormattedText text={section.content} />
        </motion.p>
        <div className="flex flex-wrap justify-center gap-4 mt-6 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.1 }}
            className="bg-slate-800/50 rounded-lg px-4 py-2"
          >
            <div className="text-sm text-slate-400">Top Genre</div>
            <div className="text-lg font-bold text-white">
              {wrappedData.insights.topGenre}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            whileHover={{ scale: 1.1 }}
            className="bg-slate-800/50 rounded-lg px-4 py-2"
          >
            <div className="text-sm text-slate-400">Discovery Score</div>
            <div className="text-lg font-bold text-white">
              {wrappedData.insights.discoveryScore}/100
            </div>
          </motion.div>
          {wrappedData.insights.bingeWatcher && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              whileHover={{ scale: 1.1 }}
              className="bg-slate-800/50 rounded-lg px-4 py-2"
            >
              <div className="text-sm text-slate-400">Binge Watcher</div>
              <motion.div
                className="text-lg font-bold text-purple-400"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ delay: 1, duration: 0.5 }}
              >
                ✓
              </motion.div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

