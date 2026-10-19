"use client"

import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { loop } from "@/lib/utils/motion-loop"
import { useEffect, useState } from "react"
import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"

interface WrappedTransitionProps {
  year: number
  onComplete: () => void
}

export function WrappedTransition({ year, onComplete }: WrappedTransitionProps) {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<"intro" | "countdown" | "reveal">("intro")
  const [countdown, setCountdown] = useState(3)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    // Phase 1: Intro animation (1.5s)
    const introTimer = setTimeout(() => {
      setPhase("countdown")
    }, 1500)

    return () => clearTimeout(introTimer)
  }, [])

  useEffect(() => {
    if (phase !== "countdown") return

    // Phase 2: Countdown (3 seconds)
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          setPhase("reveal")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdownInterval)
  }, [phase])

  useEffect(() => {
    if (phase === "reveal") {
      // Phase 3: Reveal animation (1s)
      const revealTimer = setTimeout(() => {
        setShowContent(true)
        // Complete transition after reveal (fade out)
        setTimeout(() => {
          onComplete()
        }, 1000)
      }, 1000)

      return () => clearTimeout(revealTimer)
    }
    return undefined
  }, [phase, onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <SpaceBackground />

      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.8 }}
            className="text-center relative z-10"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                duration: 0.8
              }}
              className="mb-8 flex justify-center"
            >
              <div className="relative">
                {/* Outer glow ring */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-50 blur-2xl"
                  {...loop(
                    reduceMotion,
                    {
                      scale: [1, 1.2, 1],
                      rotate: [0, 360],
                    },
                    {
                      scale: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      },
                      rotate: {
                        duration: 8,
                        repeat: Infinity,
                        ease: "linear",
                      },
                    }
                  )}
                />

                {/* Main icon circle */}
                <div className="relative w-32 h-32 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl">
                  <motion.svg
                    className="w-16 h-16 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </motion.svg>
                </div>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4"
            >
              Your {year} Wrapped
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-xl text-purple-200"
            >
              Get ready...
            </motion.p>
          </motion.div>
        )}

        {phase === "countdown" && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.5 }}
            className="text-center relative z-10"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 20
              }}
              className="mb-8"
            >
              <div className="relative inline-block">
                {/* Glow effect */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-75 blur-3xl"
                  {...loop(
                    reduceMotion,
                    {
                      scale: [1, 1.3, 1],
                    },
                    {
                      duration: 0.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }
                  )}
                />

                {/* Countdown number */}
                <div className="relative w-48 h-48 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl">
                  <motion.span
                    key={countdown}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-8xl font-bold text-white"
                  >
                    {countdown}
                  </motion.span>
                </div>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-2xl text-purple-200"
            >
              {countdown > 0 ? "Preparing your story..." : "Here we go!"}
            </motion.p>
          </motion.div>
        )}

        {phase === "reveal" && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center relative z-10 w-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15
              }}
              className="mb-8 flex justify-center"
            >
              <div className="relative">
                {/* Expanding rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border-4 border-cyan-400"
                    initial={{ scale: 0, opacity: 1 }}
                    {...loop(
                      reduceMotion,
                      {
                        scale: [1, 2, 3],
                        opacity: [1, 0.5, 0]
                      },
                      {
                        duration: 1.5,
                        delay: i * 0.2,
                        repeat: Infinity,
                        ease: "easeOut",
                      }
                    )}
                  />
                ))}

                {/* Main reveal icon */}
                <div className="relative w-32 h-32 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl">
                  <motion.svg
                    className="w-16 h-16 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </motion.svg>
                </div>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4"
            >
              {showContent ? "Your Wrapped Awaits" : "Revealing Your Story"}
            </motion.h1>

            {showContent && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex justify-center gap-2 mt-8"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full"
                    {...loop(
                      reduceMotion,
                      {
                        scale: [1, 1.5, 1],
                        opacity: [0.5, 1, 0.5],
                      },
                      {
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }
                    )}
                  />
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

