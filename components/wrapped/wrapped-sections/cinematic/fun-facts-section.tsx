"use client"

import { motion } from "framer-motion"

import { FormattedText } from "@/components/shared/formatted-text"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { GOLD_HIGHLIGHT_CLASS } from "@/components/wrapped/cinematic/theme"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicFunFactsSection({ section }: Props) {
  const facts = (
    section.data && "facts" in section.data ? section.data.facts : []
  ) as string[]

  return (
    <SlideFrame eyebrow="Deleted Scenes" title={section.title} narrative={section.content || undefined}>
      <ul className="max-w-2xl mx-auto space-y-4 text-left">
        {facts.map((fact, idx) => (
          <motion.li
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 1.2 + idx * 0.5 }}
            className="flex items-start gap-4"
          >
            <span className="font-serif text-gold text-lg leading-relaxed select-none" aria-hidden>
              ✦
            </span>
            <span className="text-base sm:text-lg text-ivory/90 leading-relaxed">
              <FormattedText text={fact} highlightClassName={GOLD_HIGHLIGHT_CLASS} />
            </span>
          </motion.li>
        ))}
      </ul>
    </SlideFrame>
  )
}
