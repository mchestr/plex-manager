"use client"

import { motion } from "framer-motion"

interface MediaServerLinkCardProps {
  serverName: string
  service: "plex" | "jellyfin"
  serverUrl?: string | null
}

export function MediaServerLinkCard({ serverName, service, serverUrl }: MediaServerLinkCardProps) {
  // Determine service-specific properties
  const isPlex = service === "plex"
  const href = isPlex ? "https://plex.tv" : (serverUrl || "https://jellyfin.org")
  const brandColor = isPlex ? "#e5a00d" : "#00a4dc"
  const gradientFrom = isPlex ? "#1f1f1f" : "#0b1423"
  const gradientVia = isPlex ? "#282828" : "#132033"
  const gradientTo = isPlex ? "#1a1a1a" : "#0a1420"

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 sm:p-4 shadow-lg shadow-black/20 transition-all duration-300 hover:shadow-xl"
      style={{
        borderColor: `${brandColor}20`,
        background: `linear-gradient(to bottom right, ${gradientFrom}, ${gradientVia}, ${gradientTo})`,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      data-testid={`${service}-link-card`}
    >
      {/* Ambient glow effect */}
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-all duration-500"
        style={{
          backgroundColor: `${brandColor}10`,
        }}
      />

      {/* Service Logo */}
      <div
        className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg shadow-md"
        style={{
          background: `linear-gradient(to bottom right, ${brandColor}, ${adjustBrightness(brandColor, -20)})`,
          boxShadow: `0 4px 6px -1px ${brandColor}20`,
        }}
      >
        {isPlex ? (
          <svg
            className="h-5 w-5 sm:h-6 sm:w-6 text-black"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12z" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 sm:h-6 sm:w-6 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 .002C8.826 0 6.22 2.607 6.218 5.78c0 1.188.36 2.292 1.006 3.21L12 16.395l4.776-7.405c.646-.918 1.006-2.022 1.006-3.21C17.78 2.607 15.174 0 12 .002zm0 8.355c-1.424 0-2.558-1.134-2.558-2.56 0-1.423 1.134-2.557 2.558-2.557 1.423 0 2.558 1.134 2.558 2.558 0 1.425-1.135 2.559-2.558 2.559zM4.977 13.785c-1.424 0-2.558 1.134-2.558 2.558 0 1.424 1.134 2.558 2.558 2.558 1.424 0 2.558-1.134 2.558-2.558 0-1.424-1.134-2.558-2.558-2.558zm7.023 5.395c-1.424 0-2.558 1.134-2.558 2.558C9.442 22.866 10.576 24 12 24c1.424 0 2.558-1.134 2.558-2.558 0-1.424-1.134-2.558-2.558-2.558zm7.023-5.395c-1.424 0-2.558 1.134-2.558 2.558 0 1.424 1.134 2.558 2.558 2.558 1.424 0 2.558-1.134 2.558-2.558 0-1.424-1.134-2.558-2.558-2.558z" />
          </svg>
        )}
      </div>

      <span className="relative text-base sm:text-lg font-semibold text-white">
        {serverName}
      </span>

      {/* Arrow indicator */}
      <svg
        className="ml-auto h-4 w-4 text-slate-500 transition-all duration-200 group-hover:translate-x-0.5"
        style={{
          color: `${brandColor}80`,
        }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </motion.a>
  )
}

/**
 * Adjust color brightness by a percentage
 */
function adjustBrightness(color: string, percent: number): string {
  const num = parseInt(color.replace("#", ""), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  return "#" + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1)
}
