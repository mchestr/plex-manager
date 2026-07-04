"use client"

import { motion, useReducedMotion } from "framer-motion"

interface SpotlightProps {
  /** Wash color at the beam's center; defaults to warm gold */
  color?: string
  /** Delay before the sweep begins, in seconds */
  delay?: number
}

/**
 * A radial spotlight that sweeps across the stage and settles center,
 * used for dramatic reveals.
 */
export function Spotlight({ color = "212, 175, 55", delay = 0 }: SpotlightProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay }}
    >
      <motion.div
        className="absolute h-[140%] w-[80%] top-[-20%]"
        style={{
          background: `radial-gradient(ellipse 50% 40% at center, rgba(${color}, 0.22), rgba(${color}, 0.06) 55%, transparent 75%)`,
        }}
        initial={reduceMotion ? { left: "10%" } : { left: "-50%" }}
        animate={{ left: "10%" }}
        transition={{ duration: 2.2, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  )
}
