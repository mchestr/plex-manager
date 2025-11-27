"use client"

import { RexDinosaur } from "@/components/shared/rex-dinosaur"
import { useEffect, useMemo, useState } from "react"

interface WrappedGeneratingAnimationProps {
  year?: number
  compact?: boolean
}

const funPhrases = [
  "Rex is digging through your watch history... 🦕",
  "Counting all those late-night binges... 🌙",
  "Discovering your secret guilty pleasures... 🤫",
  "Calculating how many hours you've spent watching... ⏰",
  "Finding your most-watched shows (Rex approves!)... 📺",
  "Tracking down your movie marathons... 🎬",
  "Unveiling your viewing personality... 🎭",
  "Rex is crafting your personalized story... ✨",
  "Almost there! Rex is putting the finishing touches... 🎨",
  "Your wrapped is taking shape... 🦖",
  "Rex found something interesting... 👀",
  "Just a few more seconds, promise!... ⏳",
  "Rex is making sure everything is perfect... 💫",
  "Almost ready to reveal your year!... 🎉",
  "Rex says you have great taste!... 👏",
]

export function WrappedGeneratingAnimation({ year, compact = false }: WrappedGeneratingAnimationProps) {
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0)
  const [displayedPhrase, setDisplayedPhrase] = useState("")
  const [isTyping, setIsTyping] = useState(true)

  useEffect(() => {
    if (!isTyping) return

    const currentPhrase = funPhrases[currentPhraseIndex]
    let charIndex = 0

    const typingInterval = setInterval(() => {
      if (charIndex < currentPhrase.length) {
        setDisplayedPhrase(currentPhrase.slice(0, charIndex + 1))
        charIndex++
      } else {
        setIsTyping(false)
        clearInterval(typingInterval)
      }
    }, 80) // Typing speed - slower for better readability

    return () => clearInterval(typingInterval)
  }, [currentPhraseIndex, isTyping])

  useEffect(() => {
    // After typing finishes, wait 2.5 seconds before rotating to next phrase
    if (!isTyping) {
      const timeout = setTimeout(() => {
        setCurrentPhraseIndex((prev) => (prev + 1) % funPhrases.length)
        setIsTyping(true)
        setDisplayedPhrase("")
      }, 2500) // Display full sentence for 2.5 seconds

      return () => clearTimeout(timeout)
    }
    return undefined
  }, [isTyping])

  // Generate stable random positions for background particles
  const backgroundParticles = useMemo(() => {
    return Array.from({ length: 20 }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
    }))
  }, [])

  // Wrapper component that includes floating particles for the full animation
  const DinosaurAnimation = ({ size = "w-32 h-32" }: { size?: string }) => (
    <div className={`${size} relative`}>
      <RexDinosaur size={size} />
      {/* Floating particles around dinosaur */}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute w-2 h-2 bg-cyan-400 rounded-full opacity-60 animate-float"
          style={{
            left: `${20 + i * 20}%`,
            top: `${10 + (i % 2) * 20}%`,
            animationDuration: `${2 + i * 0.5}s`,
            animationDelay: `${i * 0.3}s`,
          }}
        />
      ))}
    </div>
  )

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <div className="mb-8">
          <DinosaurAnimation size="w-24 h-24" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-6">
          Creating Your {year || new Date().getFullYear()} Wrapped
        </h2>

        <div className="h-16 flex items-center justify-center mb-6">
          <p className="text-lg text-cyan-400 font-medium min-h-[1.5rem] text-center">
            {displayedPhrase}
            <span className="inline-block animate-pulse ml-1">|</span>
          </p>
        </div>

        <div className="flex justify-center gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-3 h-3 bg-gradient-to-r from-green-400 to-cyan-400 rounded-full animate-bounce"
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: "1s",
              }}
            />
          ))}
        </div>

        <p className="text-slate-400 text-sm text-center">
          Rex is working hard! This usually takes 30-60 seconds 🦖✨
        </p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {backgroundParticles.map((particle, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-cyan-400/20 rounded-full animate-twinkle"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="max-w-3xl w-full text-center relative z-10">
        {/* Main Dinosaur Animation */}
        <div className="mb-12 flex justify-center">
          <div className="relative">
            <DinosaurAnimation size="w-48 h-48 md:w-64 md:h-64" />
            {/* Glow effect around dinosaur */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 via-cyan-400/20 to-purple-400/20 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: "3s" }} />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 animate-fade-in">
          Creating Your {year || new Date().getFullYear()} Wrapped
        </h1>

        {/* Rotating Phrase */}
        <div className="h-20 md:h-24 flex items-center justify-center mb-10">
          <p className="text-xl md:text-3xl text-cyan-400 font-medium min-h-[3rem] flex items-center">
            <span className="mr-2 text-2xl md:text-4xl">🦖</span>
            <span>
              {displayedPhrase}
              <span className="inline-block animate-pulse ml-2">|</span>
            </span>
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-3 mb-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-4 h-4 bg-gradient-to-r from-green-400 via-cyan-400 to-purple-400 rounded-full animate-bounce"
              style={{
                animationDelay: `${i * 0.15}s`,
                animationDuration: "1.2s",
              }}
            />
          ))}
        </div>

        {/* Fun message */}
        <div className="space-y-2">
          <p className="text-slate-300 text-lg md:text-xl font-medium">
            Rex is working hard! 🦕✨
          </p>
          <p className="text-slate-400 text-sm md:text-base">
            This usually takes about 30-60 seconds. Grab some popcorn! 🍿
          </p>
        </div>
      </div>
    </div>
  )
}

