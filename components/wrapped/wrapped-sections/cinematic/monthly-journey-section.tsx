"use client"

import { motion } from "framer-motion"

import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { WrappedSection, WrappedStatistics } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

type MonthEntry = NonNullable<WrappedStatistics["watchTimeByMonth"]>[number]

export function CinematicMonthlyJourneySection({ section }: Props) {
  const months = (
    section.data && "watchTimeByMonth" in section.data
      ? section.data.watchTimeByMonth
      : []
  ) as MonthEntry[]

  const maxWatchTime = Math.max(...months.map((m) => m.watchTime), 1)

  return (
    <SlideFrame eyebrow="Act IV — A Year in Reels" title={section.title} narrative={section.content}>
      {/* Filmstrip: one frame per month, sprocket-holed, bar height = watch time */}
      <div className="overflow-x-auto pb-2 -mx-2 px-2">
        <div className="flex gap-1.5 min-w-max mx-auto justify-center border-y-4 border-dotted border-ivory/15 py-3">
          {months.map((month, idx) => {
            const isPeak = month.watchTime === maxWatchTime
            const topTitle = month.topShow?.title || month.topMovie?.title
            return (
              <motion.div
                key={month.month}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.4 + idx * 0.1 }}
                className="w-16 sm:w-20 flex flex-col items-center gap-2"
              >
                <div className="h-24 sm:h-28 w-full flex items-end bg-ivory/5 rounded-sm p-1">
                  <motion.div
                    className={
                      isPeak
                        ? "w-full rounded-sm bg-gradient-to-t from-gold to-gold-bright"
                        : "w-full rounded-sm bg-ivory/25"
                    }
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((month.watchTime / maxWatchTime) * 100, 4)}%` }}
                    transition={{ duration: 0.8, delay: 1.6 + idx * 0.1, ease: "easeOut" }}
                  />
                </div>
                <p className={isPeak ? "text-gold-bright text-xs uppercase tracking-widest" : "text-taupe text-xs uppercase tracking-widest"}>
                  {month.monthName.slice(0, 3)}
                </p>
                {topTitle && (
                  <p className="text-[10px] leading-tight text-ivory/60 text-center line-clamp-2 w-full">
                    {topTitle}
                  </p>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </SlideFrame>
  )
}
