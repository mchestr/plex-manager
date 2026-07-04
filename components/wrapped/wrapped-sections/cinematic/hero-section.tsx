"use client"

import { motion } from "framer-motion"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { Spotlight } from "@/components/wrapped/cinematic/spotlight"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicHeroSection({ section }: Props) {
  const prominentStat = (
    section.data && "prominentStat" in section.data
      ? section.data.prominentStat
      : undefined
  ) as { value: string | number; label: string; description?: string } | undefined

  return (
    <div className="relative">
      <Spotlight delay={0.2} />
      <SlideFrame
        eyebrow={section.subtitle || "Now Presenting"}
        title={section.title}
        narrative={section.content}
        narrativePosition="after"
      >
        {prominentStat && (
          <div className="flex flex-col items-center space-y-2 py-4">
            {typeof prominentStat.value === "number" ? (
              <GoldCountUp
                value={prominentStat.value}
                suffix={prominentStat.label}
                className="text-6xl sm:text-8xl md:text-9xl"
              />
            ) : (
              <span className="font-serif text-6xl sm:text-8xl bg-gradient-to-b from-gold-bright to-gold bg-clip-text text-transparent">
                {prominentStat.value}
              </span>
            )}
            {prominentStat.description && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 0.8 }}
                className="text-sm sm:text-base text-taupe uppercase tracking-[0.25em]"
              >
                {prominentStat.description}
              </motion.p>
            )}
          </div>
        )}
      </SlideFrame>
    </div>
  )
}
