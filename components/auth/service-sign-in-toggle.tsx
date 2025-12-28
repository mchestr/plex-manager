"use client"

import { JellyfinSignInButton } from "@/components/auth/jellyfin-sign-in-button"
import { PlexSignInButton } from "@/components/auth/plex-sign-in-button"
import { motion } from "framer-motion"
import { useState } from "react"

interface ServiceSignInToggleProps {
  hasPlex: boolean
  hasJellyfin: boolean
  plexServerName?: string
  jellyfinServerName?: string
}

export function ServiceSignInToggle({
  hasPlex,
  hasJellyfin,
  plexServerName,
  jellyfinServerName,
}: ServiceSignInToggleProps) {
  // Default to Plex if available, otherwise Jellyfin
  const [selectedService, setSelectedService] = useState<"plex" | "jellyfin">(
    hasPlex ? "plex" : "jellyfin"
  )
  const [isExpanded, setIsExpanded] = useState(false)

  // If only one service is available, don't show toggle
  if (!hasPlex && !hasJellyfin) {
    return null
  }

  // Show collapsed state initially
  if (!isExpanded) {
    return (
      <motion.button
        onClick={() => setIsExpanded(true)}
        className="group relative px-10 py-4 text-white font-semibold rounded-xl overflow-hidden bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all duration-300"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.98 }}
        data-testid="sign-in-button"
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <span className="relative flex items-center gap-2">
          Sign in
          <svg
            className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </motion.button>
    )
  }

  // Single service - show just the form
  if (hasPlex && !hasJellyfin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <PlexSignInButton
          serverName={plexServerName}
          showWarning={true}
          warningDelay={3000}
          showDisclaimer={false}
          buttonText="Sign in with Plex"
          loadingText="Signing in..."
          buttonClassName="px-6 sm:px-8 py-3 sm:py-4 flex justify-center items-center gap-3 text-white text-base sm:text-lg font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
        />
      </motion.div>
    )
  }

  if (hasJellyfin && !hasPlex) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
        data-testid="jellyfin-sign-in-section"
      >
        <JellyfinSignInButton
          serverName={jellyfinServerName}
          buttonText="Sign in with Jellyfin"
          loadingText="Signing in..."
          showDisclaimer={false}
        />
      </motion.div>
    )
  }

  // Both services available - show toggle
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md space-y-4"
    >
      {/* Toggle Tabs */}
      <div className="flex gap-2 p-1 bg-slate-800/50 rounded-lg border border-slate-700">
        <button
          onClick={() => setSelectedService("plex")}
          data-testid="toggle-plex"
          className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 ${
            selectedService === "plex"
              ? "bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 text-white shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-700/50"
          }`}
        >
          Plex
        </button>
        <button
          onClick={() => setSelectedService("jellyfin")}
          data-testid="toggle-jellyfin"
          className={`flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 ${
            selectedService === "jellyfin"
              ? "bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 text-white shadow-lg"
              : "text-slate-400 hover:text-white hover:bg-slate-700/50"
          }`}
        >
          Jellyfin
        </button>
      </div>

      {/* Sign-in Form - Fixed height container to prevent jumping */}
      <div className="w-full min-h-[280px] flex items-start">
        <div className="w-full transition-opacity duration-200" key={selectedService}>
          {selectedService === "plex" ? (
            <PlexSignInButton
              serverName={plexServerName}
              showWarning={true}
              warningDelay={3000}
              showDisclaimer={false}
              buttonText="Sign in with Plex"
              loadingText="Signing in..."
              buttonClassName="px-6 sm:px-8 py-3 sm:py-4 flex justify-center items-center gap-3 text-white text-base sm:text-lg font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
            />
          ) : (
            <JellyfinSignInButton
              serverName={jellyfinServerName}
              buttonText="Sign in with Jellyfin"
              loadingText="Signing in..."
              showDisclaimer={false}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
