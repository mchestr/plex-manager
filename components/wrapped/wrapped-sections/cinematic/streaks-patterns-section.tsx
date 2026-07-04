"use client"

import { motion } from "framer-motion"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import type { DerivedStatistics } from "@/lib/wrapped/derived-statistics"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicStreaksPatternsSection({ section }: Props) {
  const derived = (
    section.data && "derived" in section.data ? section.data.derived : undefined
  ) as DerivedStatistics | undefined

  const maxHourMinutes = derived ? Math.max(...derived.hourHistogram, 1) : 1
  const maxDayMinutes = derived
    ? Math.max(...derived.dayOfWeekHistogram.map((d) => d.watchTime), 1)
    : 1

  return (
    <SlideFrame eyebrow="Act III — The Rituals" title={section.title} narrative={section.content}>
      {derived && (
        <div className="space-y-8 pt-2">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-16">
            {derived.longestStreak && (
              <div>
                <GoldCountUp
                  value={derived.longestStreak.days}
                  className="text-5xl sm:text-7xl"
                  suffix={derived.longestStreak.days === 1 ? "day streak" : "days straight"}
                />
              </div>
            )}
            {derived.peakHour && (
              <div className="text-center">
                <p className="font-serif text-5xl sm:text-7xl bg-gradient-to-b from-gold-bright to-gold bg-clip-text text-transparent">
                  {derived.peakHour.label}
                </p>
                <p className="text-xs sm:text-sm text-taupe uppercase tracking-[0.25em] mt-1">
                  Your usual showtime
                </p>
              </div>
            )}
          </div>

          {/* 24-hour histogram: when the projector ran */}
          <div className="max-w-xl mx-auto">
            <div className="flex items-end justify-between gap-[2px] h-20 sm:h-24">
              {derived.hourHistogram.map((minutes, hour) => (
                <motion.div
                  key={hour}
                  className={
                    hour === derived.peakHour?.hour
                      ? "flex-1 rounded-t-sm bg-gradient-to-t from-gold to-gold-bright"
                      : "flex-1 rounded-t-sm bg-ivory/20"
                  }
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((minutes / maxHourMinutes) * 100, 2)}%` }}
                  transition={{ duration: 0.7, delay: 1.6 + hour * 0.03, ease: "easeOut" }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-taupe uppercase tracking-widest mt-2">
              <span>Midnight</span>
              <span>Noon</span>
              <span>11 PM</span>
            </div>
          </div>

          {/* Weekly rhythm: minutes per day of week, peak day in gold */}
          <div className="max-w-sm mx-auto">
            <div className="flex items-end justify-between gap-1.5 h-14 sm:h-16">
              {derived.dayOfWeekHistogram.map((day, idx) => (
                <motion.div
                  key={day.day}
                  className={
                    day.watchTime === maxDayMinutes
                      ? "flex-1 rounded-t-sm bg-gradient-to-t from-gold to-gold-bright"
                      : "flex-1 rounded-t-sm bg-ivory/20"
                  }
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((day.watchTime / maxDayMinutes) * 100, 3)}%` }}
                  transition={{ duration: 0.7, delay: 2.2 + idx * 0.08, ease: "easeOut" }}
                />
              ))}
            </div>
            <div className="flex justify-between gap-1.5 mt-2">
              {derived.dayOfWeekHistogram.map((day) => (
                <span
                  key={day.day}
                  className={
                    day.watchTime === maxDayMinutes
                      ? "flex-1 text-center text-[10px] uppercase tracking-widest text-gold-bright"
                      : "flex-1 text-center text-[10px] uppercase tracking-widest text-taupe"
                  }
                >
                  {day.day.slice(0, 3)}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-taupe uppercase tracking-[0.25em]">
            {derived.weekendVsWeekday.weekendPct}% of your viewing was a weekend affair
          </p>
        </div>
      )}
    </SlideFrame>
  )
}
