"use client"

import { motion } from "framer-motion"

import { FormattedText } from "@/components/shared/formatted-text"
import { MarqueeText } from "@/components/wrapped/cinematic/marquee-text"
import { EYEBROW_CLASS, GOLD_HIGHLIGHT_CLASS } from "@/components/wrapped/cinematic/theme"
import { MovieData, ShowData, WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
  userName?: string
}

/**
 * Closing credits: the top titles scroll up like a cast list, then the
 * farewell line.
 */
export function CinematicFinaleSection({ section, userName }: Props) {
  const data = (section.data || {}) as {
    topMovies?: MovieData[]
    topShows?: ShowData[]
  }

  const credits: Array<{ role: string; name: string }> = [
    ...(userName ? [{ role: "Starring", name: userName }] : []),
    ...(data.topMovies || []).map((m, i) => ({
      role: i === 0 ? "Featured Films" : "",
      name: m.title,
    })),
    ...(data.topShows || []).map((s, i) => ({
      role: i === 0 ? "Featured Series" : "",
      name: s.title,
    })),
  ]

  return (
    <div className="text-center space-y-8" data-testid="wrapped-finale">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
        className={EYEBROW_CLASS}
      >
        The End
      </motion.p>
      <h2 className="text-3xl sm:text-4xl md:text-5xl">
        <MarqueeText text={section.title} delay={0.4} />
      </h2>

      {/* Rolling credits window */}
      {credits.length > 0 && (
        <div
          className="relative h-44 sm:h-52 max-w-md mx-auto overflow-hidden"
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)",
          }}
        >
          <motion.div
            initial={{ y: "70%" }}
            animate={{ y: "-100%" }}
            transition={{ duration: Math.max(credits.length * 1.6, 8), delay: 0.5, ease: "linear" }}
            className="space-y-4"
          >
            {credits.map((credit, idx) => (
              <div key={idx} className="space-y-1">
                {credit.role && (
                  <p className="text-[10px] uppercase tracking-[0.4em] text-taupe">{credit.role}</p>
                )}
                <p className="font-serif text-lg sm:text-xl text-ivory uppercase tracking-widest">
                  {credit.name}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      )}

      {section.content && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2 }}
          className="text-lg sm:text-xl text-ivory/90 leading-relaxed max-w-2xl mx-auto"
        >
          <FormattedText text={section.content} highlightClassName={GOLD_HIGHLIGHT_CLASS} />
        </motion.p>
      )}
    </div>
  )
}
