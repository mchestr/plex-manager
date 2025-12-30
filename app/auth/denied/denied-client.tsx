"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export function DeniedAccessPageClient() {
  const router = useRouter()
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([])
  const [shockwaves, setShockwaves] = useState<Array<{ id: number; delay: number }>>([])

  useEffect(() => {
    // Generate particles for the "X" effect
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 0.5,
    }))
    setParticles(newParticles)

    // Generate shockwave rings
    const newShockwaves = Array.from({ length: 3 }, (_, i) => ({
      id: i,
      delay: i * 0.3,
    }))
    setShockwaves(newShockwaves)
  }, [])

  return (
    <>
      {/* Animated particles background */}
      {particles.map((particle) => (
        <motion.div
          key={`particle-${particle.id}`}
          className="absolute w-1 h-1 rounded-full bg-red-500"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
          }}
          transition={{
            duration: 2,
            delay: particle.delay,
            repeat: Infinity,
            repeatDelay: 3,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Shockwave rings */}
      {shockwaves.map((shockwave) => (
        <motion.div
          key={`shockwave-${shockwave.id}`}
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.5, 0],
            scale: [0.5, 2, 2.5],
          }}
          transition={{
            duration: 1.5,
            delay: shockwave.delay,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeOut",
          }}
        >
          <div className="w-96 h-96 rounded-full border-2 border-red-500/30" />
        </motion.div>
      ))}

      <div className="z-10 max-w-md w-full relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-slate-800/90 backdrop-blur-sm border border-red-500/50 rounded-lg p-8 shadow-2xl"
        >
          {/* Denied Icon */}
          <div className="flex justify-center mb-6">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.2,
              }}
              className="relative"
            >
              {/* X Icon with glow effect */}
              <div className="relative w-24 h-24">
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full"
                >
                  {/* Glow effect */}
                  <circle cx="50" cy="50" r="45" fill="rgba(239, 68, 68, 0.1)" />
                  {/* X lines */}
                  <motion.path
                    d="M25 25 L75 75 M75 25 L25 75"
                    stroke="rgb(239, 68, 68)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: 0.8,
                      delay: 0.4,
                      ease: "easeInOut",
                    }}
                  />
                </svg>
                {/* Pulsing glow */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-red-500/20"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 0.8, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
            </motion.div>
          </div>

          {/* Denied Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-center"
          >
            <motion.h1
              data-testid="access-denied-heading"
              className="text-3xl font-bold text-red-400 mb-3"
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              Access Denied
            </motion.h1>
            <p className="text-lg text-slate-300 mb-2">
              You don't have access to this Plex server
            </p>
            <p className="text-sm text-slate-400 mb-6">
              Please contact the server administrator if you believe this is an error
            </p>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex flex-col gap-3"
          >
            <Button
              asChild
              variant="danger"
              className="w-full"
            >
              <Link href="/">
                Try Again
              </Link>
            </Button>
            <Button
              onClick={() => router.push("/")}
              data-testid="return-home-button"
              variant="secondary"
              className="w-full"
            >
              Return Home
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
