"use client"

import { motion } from "motion/react"
import { useEffect, useState } from "react"

interface SuccessAnimationProps {
  onComplete: () => void
  title?: string
  message?: string
}

export function SuccessAnimation({ onComplete, title = "Success!", message = "Configuration saved" }: SuccessAnimationProps) {
  // Random celebration particles, generated once per mount
  const [particles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      driftX: (Math.random() - 0.5) * 200,
      driftY: (Math.random() - 0.5) * 200,
    }))
  )

  useEffect(() => {
    // Complete animation after duration
    const timer = setTimeout(() => {
      onComplete()
    }, 1500)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />

      {/* Success Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Checkmark Circle */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            duration: 0.6,
          }}
          className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 via-purple-400 to-pink-400 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.6)]"
        >
          {/* Outer glow ring */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="absolute inset-0 rounded-full border-4 border-cyan-400"
          />

          {/* Checkmark */}
          <motion.svg
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="w-12 h-12 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <motion.path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            />
          </motion.svg>
        </motion.div>

        {/* Success Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-6 text-center"
        >
          <motion.p
            className="text-2xl font-semibold text-white mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {title}
          </motion.p>
          <motion.p
            className="text-sm text-slate-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {message}
          </motion.p>
        </motion.div>

        {/* Celebration Particles */}
        {particles.map((particle) => {
          const colors = ['bg-cyan-400', 'bg-purple-400', 'bg-pink-400']
          const color = colors[particle.id % 3]
          return (
          <motion.div
            key={particle.id}
            className={`absolute w-2 h-2 rounded-full ${color}`}
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
            }}
            initial={{
              scale: 0,
              opacity: 1,
              x: 0,
              y: 0,
            }}
            animate={{
              scale: [0, 1, 0],
              opacity: [1, 1, 0],
              x: particle.driftX,
              y: particle.driftY,
            }}
            transition={{
              duration: 1,
              delay: 0.4,
              ease: "easeOut",
            }}
          />
          )
        })}
      </div>
    </motion.div>
  )
}

