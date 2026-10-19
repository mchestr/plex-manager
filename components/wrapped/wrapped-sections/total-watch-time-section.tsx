"use client"

import { WrappedData, WrappedSection } from "@/types/wrapped"
import { motion } from "motion/react"
import { FormattedText } from "@/components/shared/formatted-text"
import { BarChart, Sparkline } from "@/components/wrapped/wrapped-charts"
import { SectionHeader } from "@/components/wrapped/wrapped-sections/section-header"
import { formatWatchTime } from "@/components/wrapped/wrapped-sections/utils"

interface TotalWatchTimeSectionProps {
  section: WrappedSection
  wrappedData: WrappedData
}

export function TotalWatchTimeSection({ section, wrappedData }: TotalWatchTimeSectionProps) {
  return (
    <div className="text-center space-y-6">
      <SectionHeader title={section.title} subtitle={section.subtitle} />
      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{
          duration: 1,
          delay: 0.4,
          type: "spring",
          stiffness: 150
        }}
        className="relative"
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 opacity-20 blur-3xl" />
        <div className="relative text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
          {formatWatchTime(wrappedData.statistics.totalWatchTime.total)}
        </div>
        {/* Monthly watch time visualization */}
        {(() => {
          // Create a complete 12-month array, filling in missing months with 0
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
          const monthlyData = wrappedData.statistics.watchTimeByMonth || []

          // Create a map of existing monthly data
          const monthlyMap = new Map(monthlyData.map(m => [m.month, m.watchTime]))

          // Build complete array with all 12 months
          const completeMonthlyData = monthNames.map((name, idx) => ({
            label: name,
            value: monthlyMap.get(idx + 1) || 0,
          }))

          // Only show if there's at least some watch time data
          const hasData = completeMonthlyData.some(m => m.value > 0)

          if (!hasData) return null

          return (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="mt-6 flex justify-center"
              >
                <Sparkline
                  data={completeMonthlyData.map(m => m.value)}
                  width={300}
                  height={50}
                  color="cyan"
                  delay={1}
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.6 }}
                className="mt-6"
              >
                <h4 className="text-sm text-slate-400 mb-4 text-center">Watch Time by Month</h4>
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 overflow-hidden">
                  <BarChart
                    data={completeMonthlyData}
                    color="cyan"
                    delay={1.4}
                    height={180}
                    formatAsTime={true}
                  />
                </div>
              </motion.div>
            </>
          )
        })()}
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto"
      >
        <FormattedText text={section.content} />
      </motion.p>
    </div>
  )
}

