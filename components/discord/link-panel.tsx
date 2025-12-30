"use client"

import { disconnectDiscordAccount, resyncDiscordRole } from "@/actions/discord"
import { useToast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useTransition } from "react"

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
  error?: string
  serverInviteCode?: string | null
  isOnServer?: boolean | null
}

export function DiscordLinkPanel({ connection, instructions, connectUrl, isEnabled, error: propError, serverInviteCode, isOnServer }: DiscordLinkPanelProps) {
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const handleDisconnect = () => {
    startTransition(async () => {
      const result = await disconnectDiscordAccount()
      if (result.success) {
        toast.showSuccess("Discord account disconnected. Refresh the page to update status.")
      } else {
        toast.showError(result.error || "Failed to disconnect Discord account")
      }
    })
  }

  const handleResync = () => {
    startTransition(async () => {
      const result = await resyncDiscordRole()
      if (result.success) {
        toast.showSuccess("Role metadata synced successfully")
      } else {
        toast.showError(result.error || "Failed to sync Discord role")
      }
    })
  }

  // Show prop error as toast if provided
  const hasShownPropError = useRef(false)
  useEffect(() => {
    if (propError && !hasShownPropError.current) {
      hasShownPropError.current = true
      toast.showError(propError)
    }
  }, [propError, toast])

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
          <h3 className="text-2xl font-semibold text-white">Link your account</h3>
          <p className="mt-1 text-sm text-slate-400">
            Connect your Discord account to sync your Plex membership status.
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
          {isOnServer === false && serverInviteCode && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-semibold text-amber-200 mb-1">⚠️ Join our Discord server</p>
              <p className="text-amber-100/90">
                You've linked your account, but you're not a member of our Discord server yet. Join the server to complete the setup.
              </p>
            </div>
          )}
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
          <p className="font-semibold text-white">Get started in two steps:</p>
          <ol className="mt-2 space-y-2 list-decimal list-inside ml-2 text-slate-300">
            <li>Join our Discord server to access support and community features</li>
            <li>Link your Discord account to sync your Plex membership status</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            {serverInviteCode && (
              <a
                href={`https://discord.gg/${serverInviteCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:scale-[1.01]"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .06-.053c.05-.025.1-.051.151-.075a.075.075 0 0 1 .079.007c.04.03.08.062.116.098a.077.077 0 0 1 .021.075c-.016.03-.036.06-.054.089a.074.074 0 0 1-.041.034c-.05.012-.102.023-.152.033a.077.077 0 0 0-.058.043c-.047.105-.09.212-.13.321a.076.076 0 0 0 .021.08c.49.49 1.043.905 1.66 1.226a.077.077 0 0 0 .084-.01c.405-.363.765-.77 1.076-1.214a.074.074 0 0 0-.041-.11c-.61-.227-1.19-.52-1.733-.874a.077.077 0 0 1-.007-.128c.12-.09.246-.174.38-.253a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c-.04-.11-.083-.217-.13-.322a.077.077 0 0 0-.057-.043c-.05-.01-.102-.02-.152-.033a.074.074 0 0 1-.041-.034c-.019-.03-.038-.06-.054-.09a.077.077 0 0 1 .021-.075c.036-.036.075-.068.116-.098a.075.075 0 0 1 .079-.007c.05.024.1.05.151.075a.074.074 0 0 1 .06.053c.026.033.057.063.085.095a.073.073 0 0 1 .026.063.076.076 0 0 1-.021.086c-.025.03-.051.06-.08.087a.08.08 0 0 1-.079.028 13.105 13.105 0 0 1-1.874.892.077.077 0 0 0-.041.107c.35.698.764 1.362 1.226 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Join Discord Server
              </a>
            )}
            <a
              href={connectUrl}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:scale-[1.01]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
              </svg>
              Link Discord account
            </a>
          </div>
        </div>
      )}

      {connection && (
        <div className="flex flex-wrap gap-3">
          <a
            href={connectUrl}
            className="inline-flex flex-1 min-w-[180px] items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30"
          >
            Review Discord link
          </a>
          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="inline-flex min-w-[160px] items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
      )}

      {connection && serverInviteCode && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300 mb-2">Join our Discord server</p>
          <p className="text-sm text-slate-300 mb-3">
            Access support channels, get help from moderators, and connect with the community.
          </p>
          <a
            href={`https://discord.gg/${serverInviteCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:border-indigo-400/60 hover:bg-indigo-500/20 hover:text-indigo-100"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .06-.053c.05-.025.1-.051.151-.075a.075.075 0 0 1 .079.007c.04.03.08.062.116.098a.077.077 0 0 1 .021.075c-.016.03-.036.06-.054.089a.074.074 0 0 1-.041.034c-.05.012-.102.023-.152.033a.077.077 0 0 0-.058.043c-.047.105-.09.212-.13.321a.076.076 0 0 0 .021.08c.49.49 1.043.905 1.66 1.226a.077.077 0 0 0 .084-.01c.405-.363.765-.77 1.076-1.214a.074.074 0 0 0-.041-.11c-.61-.227-1.19-.52-1.733-.874a.077.077 0 0 1-.007-.128c.12-.09.246-.174.38-.253a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c-.04-.11-.083-.217-.13-.322a.077.077 0 0 0-.057-.043c-.05-.01-.102-.02-.152-.033a.074.074 0 0 1-.041-.034c-.019-.03-.038-.06-.054-.09a.077.077 0 0 1 .021-.075c.036-.036.075-.068.116-.098a.075.075 0 0 1 .079-.007c.05.024.1.05.151.075a.074.074 0 0 1 .06.053c.026.033.057.063.085.095a.073.073 0 0 1 .026.063.076.076 0 0 1-.021.086c-.025.03-.051.06-.08.087a.08.08 0 0 1-.079.028 13.105 13.105 0 0 1-1.874.892.077.077 0 0 0-.041.107c.35.698.764 1.362 1.226 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Discord Server
          </a>
        </div>
      )}
    </div>
  )
}

