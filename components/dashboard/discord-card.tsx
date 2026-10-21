"use client"

import { motion } from "motion/react"
import type { DashboardDiscordConnection } from "@/types/discord"

interface DiscordCardProps {
  connection: DashboardDiscordConnection | null
}

export function DiscordCard({ connection }: DiscordCardProps) {
  // Not linked: the /discord/link page offers both Join server and Link account
  if (!connection) {
    return (
      <motion.a
        href="/discord/link"
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4 transition-colors duration-300 hover:bg-accent"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        data-testid="discord-card-link-action"
      >
        {/* Discord Logo */}
        <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <svg className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </div>

        <span className="relative text-base sm:text-lg font-semibold text-foreground">
          Discord
        </span>
        {/* Arrow indicator */}
        <svg
          className="ml-auto h-4 w-4 text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5"
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

  // Linked: show status with a checkmark
  return (
    <motion.div
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 sm:p-4 transition-colors duration-300 hover:bg-accent"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      data-testid="discord-card"
    >
      {/* Discord Logo */}
      <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <svg className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      </div>

      <span className="relative text-base sm:text-lg font-semibold text-foreground">
        Discord
      </span>
      {/* Connected checkmark */}
      <div className="ml-auto flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
        <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </motion.div>
  )
}
