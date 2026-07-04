"use client"

import { motion, useReducedMotion } from "framer-motion"

import { DISPLAY_CLASS } from "./theme"
import { cn } from "@/lib/utils"

interface MarqueeTextProps {
  text: string
  className?: string
  /** Seconds before the first letter appears */
  delay?: number
  /** Seconds between letters */
  stagger?: number
}

/**
 * Kinetic marquee typography: reveals a headline letter by letter, like a
 * name appearing on a theater sign.
 */
export function MarqueeText({
  text,
  className,
  delay = 0,
  stagger = 0.04,
}: MarqueeTextProps) {
  const reduceMotion = useReducedMotion()
  const letters = Array.from(text)

  if (reduceMotion) {
    return <span className={cn(DISPLAY_CLASS, className)}>{text}</span>
  }

  return (
    <span className={cn(DISPLAY_CLASS, className)} aria-label={text}>
      {letters.map((letter, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: "0.4em", filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.5,
            delay: delay + i * stagger,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {letter}
        </motion.span>
      ))}
    </span>
  )
}
