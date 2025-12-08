"use client"

import { motion } from "framer-motion"
import type { DashboardDiscordConnection } from "@/components/discord/link-callout"

interface DiscordCardProps {
  connection: DashboardDiscordConnection | null
  serverInviteCode?: string | null
}

export function DiscordCard({ connection, serverInviteCode }: DiscordCardProps) {
  const isConnected = Boolean(connection)
  const discordUrl = serverInviteCode
    ? `https://discord.gg/${serverInviteCode}`
    : null

  // If there's a server invite, make the whole card clickable to join
  if (discordUrl && !isConnected) {
    return (
      <motion.a
        href={discordUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block overflow-hidden rounded-2xl border border-[#5865F2]/20 bg-gradient-to-br from-[#5865F2]/10 via-[#5865F2]/5 to-slate-900/80 p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-[#5865F2]/40 hover:shadow-[#5865F2]/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        data-testid="discord-card"
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#5865F2]/10 blur-3xl transition-all duration-500 group-hover:bg-[#5865F2]/20" />

        <div className="relative flex items-center gap-4">
          {/* Discord Logo */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#5865F2] shadow-lg shadow-[#5865F2]/20">
            <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-white">Discord</h3>
            <p className="mt-0.5 text-sm text-slate-400">Join our community</p>
          </div>

          {/* Arrow indicator */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-400 transition-all duration-200 group-hover:bg-[#5865F2]/20 group-hover:text-[#5865F2]">
            <svg
              className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </div>
        </div>
      </motion.a>
    )
  }

  // Connected state - show status
  return (
    <motion.div
      className="group relative overflow-hidden rounded-2xl border border-[#5865F2]/20 bg-gradient-to-br from-[#5865F2]/10 via-[#5865F2]/5 to-slate-900/80 p-6 shadow-xl shadow-black/30 transition-all duration-300 hover:border-[#5865F2]/40"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      data-testid="discord-card"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#5865F2]/10 blur-3xl" />

      <div className="relative flex items-center gap-4">
        {/* Discord Logo */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#5865F2] shadow-lg shadow-[#5865F2]/20">
          <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-semibold text-white">Discord</h3>
          <p className="mt-0.5 text-sm text-slate-400 truncate">
            {isConnected
              ? `Connected as ${connection?.globalName || connection?.username}`
              : "Join our community"}
          </p>
        </div>

        {/* Connected indicator or Join button */}
        {isConnected ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-green-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : discordUrl ? (
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5865F2] px-3 py-2 text-sm font-medium text-white shadow shadow-[#5865F2]/20 transition hover:bg-[#4752C4]"
            data-testid="discord-join-button"
          >
            Join
          </a>
        ) : null}
      </div>
    </motion.div>
  )
}
