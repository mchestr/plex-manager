"use client"

import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"

import { useIsClient } from "@/hooks/use-is-client"
import { loop } from "@/lib/utils/motion-loop"

interface Star {
  id: number
  x: number
  y: number
  size: number
  opacity: number
  duration: number
}

export function SpaceBackground() {
  const isClient = useIsClient()
  const reduceMotion = useReducedMotion()
  // Random stars are generated once and rendered only on the client, so the
  // server HTML never disagrees with them. 50 stars keeps it cheap.
  const [stars] = useState<Star[]>(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.6 + 0.4,
      duration: 3 + Math.random() * 2, // 3-5 seconds - slower
    }))
  )

  return (
    <div className="fixed inset-0 overflow-hidden -z-10">
      {/* Deep space gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900" />

      {/* Simple twinkling stars - slower, smoother animation */}
      {isClient && stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, ${star.opacity})`,
          }}
          {...loop(
            reduceMotion,
            { opacity: [star.opacity * 0.5, star.opacity, star.opacity * 0.5] },
            { duration: star.duration, repeat: Infinity, ease: "easeInOut" }
          )}
        />
      ))}

      {/* Simple nebula clouds - slower movement */}
      <motion.div
        className="absolute top-0 left-1/4 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl"
        {...loop(
          reduceMotion,
          { x: [0, 50, 0], y: [0, 30, 0] },
          { duration: 40, repeat: Infinity, ease: "easeInOut" }
        )}
      />
      <motion.div
        className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl"
        {...loop(
          reduceMotion,
          { x: [0, -50, 0], y: [0, -30, 0] },
          { duration: 50, repeat: Infinity, ease: "easeInOut" }
        )}
      />
      <motion.div
        className="absolute top-1/2 right-1/3 w-96 h-96 bg-pink-400/10 rounded-full blur-3xl"
        {...loop(
          reduceMotion,
          { x: [0, 30, 0], y: [0, -20, 0] },
          { duration: 45, repeat: Infinity, ease: "easeInOut" }
        )}
      />
    </div>
  )
}

