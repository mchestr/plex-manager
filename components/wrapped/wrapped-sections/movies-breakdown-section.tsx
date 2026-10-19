"use client"

import { motion } from "framer-motion"
import CountUp from "react-countup"
import { FormattedText } from "@/components/shared/formatted-text"
import { SectionHeader } from "@/components/wrapped/wrapped-sections/section-header"
import { formatDuration } from "@/lib/utils/format"
import { DonutChart, ProgressBar } from "@/components/wrapped/wrapped-charts"
import { WrappedData, WrappedSection } from "@/types/wrapped"

interface MoviesBreakdownSectionProps {
  section: WrappedSection
  wrappedData: WrappedData
  sectionIndex: number
}

export function MoviesBreakdownSection({ section, wrappedData, sectionIndex }: MoviesBreakdownSectionProps) {
  return (
    <div className="text-center space-y-6">
      <SectionHeader title={section.title} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto"
      >
        <motion.div
          initial={{ opacity: 0, x: -50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{
            duration: 0.8,
            delay: 0.4,
            type: "spring",
            stiffness: 100
          }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-6 relative overflow-hidden"
        >
          <div className="relative text-4xl font-bold text-cyan-400 mb-2" key={`movies-${sectionIndex}`}>
            <CountUp key={`${sectionIndex}-movies`} start={0} end={wrappedData.statistics.moviesWatched} duration={2} delay={0.6} separator="," />
          </div>
          <div className="relative text-slate-300">Movies Watched</div>
          <div className="relative text-sm text-slate-400 mt-2">
            {formatDuration(wrappedData.statistics.totalWatchTime.movies, "long", { largestUnit: "day" })}
          </div>
          {/* Progress bar for movies watch time */}
          {wrappedData.statistics.totalWatchTime.total > 0 && (
            <div className="mt-4">
              <ProgressBar
                value={wrappedData.statistics.totalWatchTime.movies}
                max={wrappedData.statistics.totalWatchTime.total}
                color="cyan"
                height={6}
                delay={1}
              />
            </div>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{
            duration: 0.8,
            delay: 0.6,
            type: "spring",
            stiffness: 100
          }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-6 relative overflow-hidden"
        >
          <motion.div className="relative text-4xl font-bold text-purple-400 mb-2" key={`episodes-${sectionIndex}`}>
            <CountUp key={`${sectionIndex}-episodes`} start={0} end={wrappedData.statistics.episodesWatched} duration={2} delay={0.8} separator="," />
          </motion.div>
          <div className="relative text-slate-300">Episodes Watched</div>
          {/* Progress bar for shows watch time */}
          {wrappedData.statistics.totalWatchTime.total > 0 && (
            <div className="mt-4">
              <ProgressBar
                value={wrappedData.statistics.totalWatchTime.shows}
                max={wrappedData.statistics.totalWatchTime.total}
                color="purple"
                height={6}
                delay={1.2}
              />
            </div>
          )}
        </motion.div>
      </motion.div>
      {/* Movies vs Shows breakdown chart */}
      {wrappedData.statistics.totalWatchTime.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="mt-6 flex justify-center"
        >
          <DonutChart
            data={[
              {
                label: "Movies",
                value: wrappedData.statistics.totalWatchTime.movies,
                color: "cyan",
              },
              {
                label: "Shows",
                value: wrappedData.statistics.totalWatchTime.shows,
                color: "purple",
              },
            ]}
            size={100}
            delay={1.4}
          />
        </motion.div>
      )}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="text-lg text-slate-300 max-w-2xl mx-auto mt-6"
      >
        <FormattedText text={section.content} />
      </motion.p>
    </div>
  )
}

