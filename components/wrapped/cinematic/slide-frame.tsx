"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

import { FormattedText } from "@/components/shared/formatted-text"
import { cn } from "@/lib/utils"

import { MarqueeText } from "./marquee-text"
import { EYEBROW_CLASS, GOLD_HIGHLIGHT_CLASS, REVEAL_SPRING } from "./theme"

interface SlideFrameProps {
  /** Small gold act label above the title, e.g. "Act I" or "Top Billing" */
  eyebrow?: string
  title: string
  /** LLM narrative rendered with gold highlights */
  narrative?: string
  children?: ReactNode
  className?: string
  /** Place the narrative before (default) or after the children block */
  narrativePosition?: "before" | "after"
}

/**
 * Shared scaffold for cinematic slides: eyebrow → marquee title →
 * narrative → slide-specific content, revealed in sequence.
 */
export function SlideFrame({
  eyebrow,
  title,
  narrative,
  children,
  className,
  narrativePosition = "before",
}: SlideFrameProps) {
  const narrativeBlock = narrative ? (
    <motion.p
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...REVEAL_SPRING, delay: 0.9 }}
      className="text-lg sm:text-xl md:text-2xl text-ivory/90 leading-relaxed max-w-3xl mx-auto"
    >
      <FormattedText text={narrative} highlightClassName={GOLD_HIGHLIGHT_CLASS} />
    </motion.p>
  ) : null

  return (
    <div className={cn("text-center space-y-6 sm:space-y-8", className)}>
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0, letterSpacing: "0.6em" }}
          animate={{ opacity: 1, letterSpacing: "0.35em" }}
          transition={{ duration: 1, delay: 0.1 }}
          className={EYEBROW_CLASS}
        >
          {eyebrow}
        </motion.p>
      )}
      <h2 className="text-3xl sm:text-4xl md:text-5xl">
        <MarqueeText text={title} delay={0.3} />
      </h2>
      {narrativePosition === "before" && narrativeBlock}
      {children && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL_SPRING, delay: 1.3 }}
        >
          {children}
        </motion.div>
      )}
      {narrativePosition === "after" && narrativeBlock}
    </div>
  )
}
