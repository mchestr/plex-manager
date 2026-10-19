"use client"

import { motion, useReducedMotion } from "motion/react"
import { Fragment } from "react"

import { DISPLAY_CLASS } from "./theme"
import { cn } from "@/lib/utils"

interface MarqueeTextProps {
  text: string
  className?: string
  /** Classes for each letter, such as a clipped text gradient, which must sit on the letters rather than the wrapper */
  letterClassName?: string
  /** Seconds before the first letter appears */
  delay?: number
  /** Seconds between letters */
  stagger?: number
}

/**
 * Kinetic marquee typography: reveals a headline letter by letter, like a
 * name appearing on a theater sign.
 *
 * Each word is one `inline-block whitespace-nowrap` span holding its animated
 * letters, so the line can only break between words (RWV-01). The blur is
 * removed when a letter lands, so nothing stays on a filter layer.
 */
export function MarqueeText({
  text,
  className,
  letterClassName,
  delay = 0,
  stagger = 0.04,
}: MarqueeTextProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <span className={cn(DISPLAY_CLASS, className, letterClassName)}>{text}</span>
  }

  const words = text.split(" ")
  const starts = words.map((_, w) => words.slice(0, w).reduce((n, word) => n + Array.from(word).length + 1, 0))

  return (
    <span className={cn(DISPLAY_CLASS, className)} aria-label={text}>
      {words.map((word, w) => (
        <Fragment key={w}>
          {w > 0 && " "}
          <span aria-hidden data-marquee-word className="inline-block whitespace-nowrap">
            {Array.from(word).map((letter, i) => (
              <motion.span
                key={i}
                className={cn("inline-block", letterClassName)}
                initial={{ opacity: 0, y: "0.4em", filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                transition={{
                  duration: 0.5,
                  delay: delay + (starts[w] + i) * stagger,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {letter}
              </motion.span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}
