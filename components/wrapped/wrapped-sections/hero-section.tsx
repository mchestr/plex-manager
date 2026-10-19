"use client"

import { motion } from "motion/react"
import { CountUp } from "@/components/ui/count-up"
import { FormattedText } from "@/components/shared/formatted-text"
import { WrappedSection } from "@/types/wrapped"

interface HeroSectionProps {
  section: WrappedSection
  sectionIndex: number
}

export function HeroSection({ section, sectionIndex }: HeroSectionProps) {
  const prominentStat = (section.data && "prominentStat" in section.data ? section.data.prominentStat : undefined) as { value: string | number; label: string; description?: string } | undefined

  return (
    <div className="text-center space-y-8">
      <motion.h1
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.8,
          type: "spring",
          stiffness: 100
        }}
        className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2"
      >
        {section.title}
      </motion.h1>
      {section.subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg sm:text-xl text-purple-200 mb-4"
        >
          {section.subtitle}
        </motion.p>
      )}
      {prominentStat && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, type: "spring", stiffness: 100 }}
          className="mb-8"
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {typeof prominentStat.value === "string" ? (
                prominentStat.value
              ) : (
                <CountUp key={`${sectionIndex}-${prominentStat.value}`} value={prominentStat.value} duration={2} delay={0.4} />
              )}
            </div>
            <div className="text-xl sm:text-2xl md:text-3xl font-semibold text-purple-300">
              {prominentStat.label}
            </div>
            {prominentStat.description && (
              <div className="text-base sm:text-lg text-purple-200/80">
                {prominentStat.description}
              </div>
            )}
          </div>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: prominentStat ? 0.6 : 0.4 }}
        className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-white max-w-4xl mx-auto text-center leading-relaxed font-medium space-y-4"
      >
        <FormattedText text={section.content} />
      </motion.div>
    </div>
  )
}

