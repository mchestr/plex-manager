"use client"

import { disconnectDiscordAccount, resyncDiscordRole } from "@/actions/discord"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useState, useTransition } from "react"

interface DiscordConnectionSummary {
  username: string
  discriminator?: string | null
  globalName?: string | null
  linkedAt?: string | Date
  metadataSyncedAt?: string | Date | null
  lastError?: string | null
}

interface DiscordLinkPanelProps {
  connection: DiscordConnectionSummary | null
  instructions?: string | null
  connectUrl: string
  isEnabled: boolean
  status?: string
  error?: string
}

export function DiscordLinkPanel({ connection, instructions, connectUrl, isEnabled, status, error: propError }: DiscordLinkPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDisconnect = () => {
    setError(null)
    setMessage(null)

    startTransition(async () => {
      const result = await disconnectDiscordAccount()
      if (result.success) {
        setMessage("Discord account disconnected. Refresh the page to update status.")
      } else {
        setError(result.error || "Failed to disconnect Discord account")
      }
    })
  }

  const handleResync = () => {
    setError(null)
    setMessage(null)

    startTransition(async () => {
      const result = await resyncDiscordRole()
      if (result.success) {
        setMessage("Role metadata synced successfully")
      } else {
        setError(result.error || "Failed to sync Discord role")
      }
    })
  }

  const displayStatus = message || status
  const displayError = error || propError

  if (!isEnabled) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-8 text-center text-slate-300 shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Discord integration</p>
        <h3 className="mt-2 text-2xl font-semibold text-white">Linking temporarily unavailable</h3>
        <p className="mt-3 text-sm text-slate-400">
          Your Plex administrator needs to finish configuring the Discord Linked Roles integration before you can complete this step.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-8 shadow-2xl shadow-indigo-950/40 ring-1 ring-white/10 backdrop-blur">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Discord linked roles</p>
          <h3 className="text-2xl font-semibold text-white">Support bot access</h3>
          <p className="mt-1 text-sm text-slate-400">
            Verify your Plex account to unlock Discord support, outage notifications, and automation roles.
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold shadow-inner",
            connection ? "text-emerald-300 bg-emerald-500/10 border border-emerald-500/40" : "text-amber-300 bg-amber-500/10 border border-amber-500/40"
          )}
        >
          {connection ? "Linked" : "Not linked"}
        </span>
      </header>

      {instructions && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Server instructions</div>
          <p className="mt-2 text-sm text-slate-200 whitespace-pre-line">{instructions}</p>
        </div>
      )}

      {connection ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm text-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Active connection</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {connection.globalName || connection.username}
                {connection.discriminator ? `#${connection.discriminator}` : ""}
              </p>
            </div>
            <button
              onClick={handleResync}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/40 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Syncing…" : "Force resync"}
            </button>
          </div>
          <dl className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Linked</dt>
              <dd className="text-white">{connection.linkedAt ? new Date(connection.linkedAt).toLocaleString() : "Recently"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last synced</dt>
              <dd className="text-white">{connection.metadataSyncedAt ? new Date(connection.metadataSyncedAt).toLocaleString() : "Pending"}</dd>
            </div>
          </dl>
          {connection.lastError && (
            <div className="mt-3 rounded-xl border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
              Last sync warning: <span className="font-medium">{connection.lastError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">Not linked yet</p>
          <p className="mt-1 text-slate-400">Approve Linked Roles in Discord to let the bot verify your Plex membership.</p>
          <Link
            href={connectUrl}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:scale-[1.01]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
            </svg>
            Start Discord linking
          </Link>
        </div>
      )}

      {(displayStatus || displayError) && (
        <div
          className={cn(
            "text-sm rounded-2xl border px-4 py-3",
            displayError
              ? "text-rose-200 border-rose-500/30 bg-rose-950/40"
              : "text-emerald-100 border-emerald-500/30 bg-emerald-950/40"
          )}
        >
          {displayError ?? displayStatus}
        </div>
      )}

      {connection && (
        <div className="flex flex-wrap gap-3">
          <Link
            href={connectUrl}
            className="inline-flex flex-1 min-w-[180px] items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30"
          >
            Review Discord link
          </Link>
          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="inline-flex min-w-[160px] items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  )
}

