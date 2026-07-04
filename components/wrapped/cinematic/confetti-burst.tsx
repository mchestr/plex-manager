"use client"

import { motion, useReducedMotion } from "framer-motion"
import { useMemo } from "react"

interface ConfettiBurstProps {
  /** Seconds before the burst fires */
  delay?: number
  /** Number of particles (kept modest — these are DOM nodes) */
  count?: number
}

const GOLD_TONES = ["#d4af37", "#f5d67b", "#b8860b", "#efe0b0"]

/**
 * A single celebratory burst of gold streamers, no canvas dependency.
 * Fires once on mount; hidden entirely under reduced motion.
 */
export function ConfettiBurst({ delay = 0, count = 40 }: ConfettiBurstProps) {
  const reduceMotion = useReducedMotion()

  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        // Deterministic pseudo-random spread so SSR/CSR markup matches
        x: Math.sin(i * 12.9898) * 45,
        drift: Math.sin(i * 78.233) * 25,
        size: 4 + (i % 4) * 2,
        rotate: (i * 137.5) % 360,
        color: GOLD_TONES[i % GOLD_TONES.length],
        delay: (i % 8) * 0.04,
      })),
    [count]
  )

  if (reduceMotion) return null

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/3"
          style={{
            width: p.size,
            height: p.size * 2.2,
            backgroundColor: p.color,
            borderRadius: 1,
          }}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.6 }}
          animate={{
            x: [0, p.x * 4, p.x * 6 + p.drift],
            y: [0, -120 - Math.abs(p.x) * 2, 260],
            opacity: [0, 1, 1, 0],
            rotate: p.rotate + 540,
            scale: 1,
          }}
          transition={{
            duration: 2.6,
            delay: delay + p.delay,
            ease: [0.15, 0.6, 0.45, 1],
            times: [0, 0.35, 1],
          }}
        />
      ))}
    </div>
  )
}
