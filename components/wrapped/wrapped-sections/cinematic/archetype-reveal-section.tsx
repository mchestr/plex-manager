"use client"

import { motion } from "framer-motion"

import { ConfettiBurst } from "@/components/wrapped/cinematic/confetti-burst"
import { MarqueeText } from "@/components/wrapped/cinematic/marquee-text"
import { Spotlight } from "@/components/wrapped/cinematic/spotlight"
import { EYEBROW_CLASS } from "@/components/wrapped/cinematic/theme"
import { FormattedText } from "@/components/shared/formatted-text"
import { GOLD_HIGHLIGHT_CLASS } from "@/components/wrapped/cinematic/theme"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

/**
 * The signature moment: dark stage, spotlight sweep, the archetype name in
 * staggered gold marquee letters, a confetti burst, then the dedication.
 */
export function CinematicArchetypeRevealSection({ section }: Props) {
  const archetype = (
    section.data && "archetype" in section.data ? section.data.archetype : undefined
  ) as { id: string; name: string; motif?: string } | undefined

  const name = archetype?.name || section.title

  return (
    <div className="relative text-center space-y-8 py-4" data-testid="wrapped-archetype-reveal">
      <Spotlight delay={0.3} />
      <ConfettiBurst delay={2.4} />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.4 }}
        className={EYEBROW_CLASS}
      >
        {section.title}
      </motion.p>

      <div className="space-y-4">
        <h2 className="text-4xl sm:text-6xl md:text-7xl leading-tight">
          <MarqueeText
            text={name}
            delay={1.2}
            stagger={0.06}
            className="bg-gradient-to-b from-gold-bright via-gold to-gold bg-clip-text text-transparent"
          />
        </h2>
        {section.subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 2.6 }}
            className="text-lg sm:text-2xl text-ivory italic font-serif"
          >
            “{section.subtitle}”
          </motion.p>
        )}
      </div>

      {section.content && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.2 }}
          className="max-w-2xl mx-auto"
        >
          <div className="border-t border-gold/30 w-16 mx-auto mb-6" />
          <p className="text-base sm:text-lg md:text-xl text-ivory/85 leading-relaxed">
            <FormattedText text={section.content} highlightClassName={GOLD_HIGHLIGHT_CLASS} />
          </p>
        </motion.div>
      )}
    </div>
  )
}
