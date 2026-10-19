"use client"

import { motion, useReducedMotion } from "motion/react"
import { loop } from "@/lib/utils/motion-loop"
import { CountUp } from "@/components/ui/count-up"
import { FormattedText } from "@/components/shared/formatted-text"
import { SectionHeader } from "@/components/wrapped/wrapped-sections/section-header"
import { BarChart, ProgressBar } from "@/components/wrapped/wrapped-charts"
import { WrappedData, WrappedSection } from "@/types/wrapped"

interface OverseerrStatsSectionProps {
  section: WrappedSection
  wrappedData: WrappedData
  sectionIndex: number
}

export function OverseerrStatsSection({ section, wrappedData, sectionIndex }: OverseerrStatsSectionProps) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="text-center space-y-6">
      <SectionHeader title={section.title} />
      {wrappedData.statistics.overseerrStats && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotateY: 10 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.3,
            type: "spring",
            stiffness: 100
          }}
          className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-8 max-w-2xl mx-auto relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/10"
            {...loop(
              reduceMotion,
              {
                opacity: [0.3, 0.6, 0.3],
              },
              {
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }
            )}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="relative text-5xl font-bold text-purple-400 mb-2"
            key={`overseerr-total-${sectionIndex}`}
          >
            <motion.div
              {...loop(
                reduceMotion,
                {
                  scale: [1, 1.02, 1],
                },
                {
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5,
                }
              )}
            >
              <CountUp key={`${sectionIndex}-overseerr-total`} value={wrappedData.statistics.overseerrStats.totalRequests} duration={2} delay={0.5} />
            </motion.div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="relative text-lg text-slate-300 mb-2"
          >
            Your Requests
          </motion.div>
          {wrappedData.statistics.overseerrStats.totalServerRequests > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="relative text-sm text-slate-400 mb-6"
            >
              out of {wrappedData.statistics.overseerrStats.totalServerRequests.toLocaleString()} total server requests
              <span className="block mt-1 text-purple-400">
                ({Math.round((wrappedData.statistics.overseerrStats.totalRequests / wrappedData.statistics.overseerrStats.totalServerRequests) * 100)}% of all requests)
              </span>
            </motion.div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm relative">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
            >
              <motion.div
                className="text-2xl font-bold text-green-400"
                key={`overseerr-approved-${sectionIndex}`}
                {...loop(
                  reduceMotion,
                  {
                    scale: [1, 1.03, 1],
                  },
                  {
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.7,
                  }
                )}
              >
                <CountUp key={`${sectionIndex}-approved`} value={wrappedData.statistics.overseerrStats.approvedRequests} duration={2} delay={0.7} />
              </motion.div>
              <div className="text-slate-400">Approved</div>
              {wrappedData.statistics.overseerrStats.totalRequests > 0 && (
                <div className="mt-2">
                  <ProgressBar
                    value={wrappedData.statistics.overseerrStats.approvedRequests}
                    max={wrappedData.statistics.overseerrStats.totalRequests}
                    color="purple"
                    height={4}
                    delay={1}
                  />
                </div>
              )}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                className="text-2xl font-bold text-yellow-400"
                key={`overseerr-pending-${sectionIndex}`}
                {...loop(
                  reduceMotion,
                  {
                    scale: [1, 1.03, 1],
                  },
                  {
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.8,
                  }
                )}
              >
                <CountUp key={`${sectionIndex}-pending`} value={wrappedData.statistics.overseerrStats.pendingRequests} duration={2} delay={0.8} />
              </motion.div>
              <div className="text-slate-400">Pending</div>
              {wrappedData.statistics.overseerrStats.totalRequests > 0 && (
                <div className="mt-2">
                  <ProgressBar
                    value={wrappedData.statistics.overseerrStats.pendingRequests}
                    max={wrappedData.statistics.overseerrStats.totalRequests}
                    color="purple"
                    height={4}
                    delay={1.2}
                  />
                </div>
              )}
            </motion.div>
          </div>
          {/* Top genres bar chart if available */}
          {wrappedData.statistics.overseerrStats.topRequestedGenres && wrappedData.statistics.overseerrStats.topRequestedGenres.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6 }}
              className="mt-6"
            >
              <h4 className="text-sm text-slate-400 mb-3 text-center">Top Requested Genres</h4>
              <BarChart
                data={wrappedData.statistics.overseerrStats.topRequestedGenres.map(g => ({
                  label: g.genre,
                  value: g.count,
                }))}
                color="purple"
                delay={1.4}
              />
            </motion.div>
          )}
        </motion.div>
      )}
      {section.content && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="text-lg text-slate-300 max-w-2xl mx-auto"
        >
          <FormattedText text={section.content} />
        </motion.p>
      )}
    </div>
  )
}

