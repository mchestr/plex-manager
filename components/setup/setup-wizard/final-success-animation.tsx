"use client"

import { motion, useReducedMotion } from "motion/react"
import { loop } from "@/lib/utils/motion-loop"
import { useEffect, useState } from "react"

interface FinalSuccessAnimationProps {
  onComplete: () => void
  title?: string
  subtitle?: string
}

export function FinalSuccessAnimation({ onComplete, title = "Setup Complete!", subtitle = "Your Plex Wrapped is ready" }: FinalSuccessAnimationProps) {
  const reduceMotion = useReducedMotion()
  // Random stars and exhaust offsets, generated once per mount
  const [exhaustParticles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      startX: (Math.random() - 0.5) * 20,
      endX: (Math.random() - 0.5) * 40,
      endY: 40 + Math.random() * 20,
    }))
  )
  const [stars] = useState(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 50, // Upper portion of screen
      delay: Math.random() * 0.5,
    }))
  )

  useEffect(() => {
    // Complete animation after duration
    const timer = setTimeout(() => {
      onComplete()
    }, 3000)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" />

      {/* Stars in the sky */}
      {stars.map((star) => (
        <motion.div
          key={`star-${star.id}`}
          className="absolute w-1 h-1 rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            boxShadow: "0 0 4px rgba(255, 255, 255, 0.8)",
          }}
          initial={{ opacity: 0, scale: 0 }}
          {...loop(
            reduceMotion,
            {
              opacity: [0, 1, 1, 0],
              scale: [0, 1, 1, 0],
            },
            {
              duration: 2,
              delay: star.delay,
              repeat: Infinity,
              repeatDelay: 1,
            }
          )}
        />
      ))}

      {/* Success Content - Centered */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Rocket */}
        <motion.div
          initial={{ y: 0, opacity: 0, scale: 0.5 }}
          animate={{ y: -150, opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.8] }}
          transition={{
            y: {
              duration: 2.5,
              ease: [0.25, 0.1, 0.25, 1], // Ease out cubic
            },
            opacity: {
              duration: 2.5,
              times: [0, 0.1, 0.7, 1],
            },
            scale: {
              duration: 2.5,
              times: [0, 0.2, 0.7, 1],
            },
          }}
          className="relative z-20 mb-8"
        >
          {/* Rocket Body */}
          <div className="relative">
            {/* Rocket SVG */}
            <svg
              width="96"
              height="160"
              viewBox="0 0 96 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-2xl"
            >
              {/* Rocket Body */}
              <path
                d="M48 6C57.8 22 66 44.5 66 69.5V119C66 137.5 57.6 154 48 158C38.4 154 30 137.5 30 119V69.5C30 44.5 38.2 22 48 6Z"
                fill="url(#rocketBodyGradient)"
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth="1.2"
              />
              {/* Inner Highlight */}
              <path
                d="M48 16C55 29 60 47 60 69V119C60 131 55.5 144 48 148C40.5 144 36 131 36 119V69C36 47 41 29 48 16Z"
                fill="url(#rocketHighlightGradient)"
                opacity="0.7"
              />
              {/* Mid Stripe */}
              <rect x="34" y="90" width="28" height="12" rx="6" fill="rgba(15, 23, 42, 0.35)" stroke="rgba(255, 255, 255, 0.15)" />
              {/* Rocket Window */}
              <circle cx="48" cy="62" r="14" fill="url(#rocketWindowGradient)" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="1.5" />
              <circle cx="48" cy="62" r="7" fill="rgba(15, 23, 42, 0.8)" />
              {/* Nose Cone Detail */}
              <path d="M48 6C42 16 38 30 38 36C43 32 53 32 58 36C58 30 54 16 48 6Z" fill="rgba(255, 255, 255, 0.18)" />
              {/* Rocket Fins */}
              <path
                d="M30 104L16 140L34 132L38 110"
                fill="url(#rocketFinGradient)"
                stroke="rgba(15, 23, 42, 0.3)"
                strokeWidth="1"
              />
              <path
                d="M66 104L80 140L62 132L58 110"
                fill="url(#rocketFinGradient)"
                stroke="rgba(15, 23, 42, 0.3)"
                strokeWidth="1"
              />
              {/* Engine Nozzle */}
              <path
                d="M36 118H60L56 150H40L36 118Z"
                fill="url(#rocketEngineGradient)"
                stroke="rgba(15, 23, 42, 0.35)"
                strokeWidth="1"
              />
              <rect x="46.5" y="118" width="3" height="18" rx="1.5" fill="rgba(255, 255, 255, 0.3)" />
              {/* Gradient Definitions */}
              <defs>
                <linearGradient id="rocketBodyGradient" x1="30" y1="6" x2="66" y2="158" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="45%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="rocketHighlightGradient" x1="36" y1="16" x2="60" y2="148" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                  <stop offset="60%" stopColor="rgba(255,255,255,0.25)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                </linearGradient>
                <linearGradient id="rocketFinGradient" x1="16" y1="104" x2="38" y2="140" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <linearGradient id="rocketEngineGradient" x1="36" y1="118" x2="60" y2="150" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="50%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                <radialGradient id="rocketWindowGradient" cx="48" cy="62" r="14" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="60%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0ea5e9" />
                </radialGradient>
              </defs>
            </svg>

            {/* Exhaust Trail */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-16">
              {exhaustParticles.map((particle, index) => (
                <motion.div
                  key={particle.id}
                  className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${
                      index % 3 === 0
                        ? "rgba(34, 211, 238, 0.9)"
                        : index % 3 === 1
                        ? "rgba(168, 85, 247, 0.9)"
                        : "rgba(236, 72, 153, 0.9)"
                    } 0%, transparent 70%)`,
                  }}
                  initial={{
                    y: 0,
                    x: particle.startX,
                    scale: 1,
                    opacity: 1,
                  }}
                  {...loop(
                    reduceMotion,
                    {
                      y: particle.endY,
                      x: particle.endX,
                      scale: [1, 1.5, 0],
                      opacity: [1, 0.8, 0],
                    },
                    {
                      duration: 0.8,
                      delay: index * 0.05,
                      repeat: Infinity,
                      ease: "easeOut",
                    }
                  )}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Success Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center"
        >
          <motion.p
            className="text-4xl font-bold text-white mb-3 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7, type: "spring", stiffness: 200 }}
          >
            {title}
          </motion.p>
          <motion.p
            className="text-lg text-slate-300 mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            {subtitle}
          </motion.p>
          <motion.p
            className="text-sm text-slate-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            Redirecting to home...
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  )
}

