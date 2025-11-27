"use client"

import { disconnectDiscordAccount } from "@/actions/discord"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { useToast } from "@/components/ui/toast"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

export interface DashboardDiscordConnection {
  username: string
  discriminator?: string | null
  globalName?: string | null
  linkedAt?: string | null
  metadataSyncedAt?: string | null
}

interface DiscordLinkCalloutProps {
  connection: DashboardDiscordConnection | null
  isEnabled: boolean
  connectUrl?: string
  serverInviteCode?: string | null
}

const defaultConnectUrl = "/discord/connect?redirect=%2F"

export function DiscordLinkCallout({ connection, isEnabled, connectUrl = defaultConnectUrl, serverInviteCode }: DiscordLinkCalloutProps) {
  const toast = useToast()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)

  const handleDisconnectClick = () => {
    setShowDisconnectModal(true)
  }

  const handleDisconnectConfirm = () => {
    startTransition(async () => {
      const result = await disconnectDiscordAccount()
      if (result.success) {
        toast.showSuccess("Discord account disconnected. Refreshing...")
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to disconnect Discord account")
      }
    })
  }

  if (!isEnabled) {
    return (
      <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-left text-slate-300 shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Discord linking</p>
        <p className="mt-2 text-lg font-semibold text-white">Temporarily unavailable</p>
        <p className="mt-1 text-sm text-slate-400">
          Discord support is offline while the integration is being configured. Check back soon.
        </p>
      </div>
    )
  }

  const isConnected = Boolean(connection)

  return (
    <div className="relative w-full rounded-2xl border border-[#5865F2]/20 bg-gradient-to-br from-[#5865F2]/10 via-[#5865F2]/5 to-slate-900/80 p-6 sm:p-8 shadow-2xl shadow-[#5865F2]/20 ring-1 ring-[#5865F2]/10 backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]">
            <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .06-.053c.05-.025.1-.051.151-.075a.075.075 0 0 1 .079.007c.04.03.08.062.116.098a.077.077 0 0 1 .021.075c-.016.03-.036.06-.054.089a.074.074 0 0 1-.041.034c-.05.012-.102.023-.152.033a.077.077 0 0 0-.058.043c-.047.105-.09.212-.13.321a.076.076 0 0 0 .021.08c.49.49 1.043.905 1.66 1.226a.077.077 0 0 0 .084-.01c.405-.363.765-.77 1.076-1.214a.074.074 0 0 0-.041-.11c-.61-.227-1.19-.52-1.733-.874a.077.077 0 0 1-.007-.128c.12-.09.246-.174.38-.253a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c-.04-.11-.083-.217-.13-.322a.077.077 0 0 0-.057-.043c-.05-.01-.102-.02-.152-.033a.074.074 0 0 1-.041-.034c-.019-.03-.038-.06-.054-.09a.077.077 0 0 1 .021-.075c.036-.036.075-.068.116-.098a.075.075 0 0 1 .079-.007c.05.024.1.05.151.075a.074.074 0 0 1 .06.053c.026.033.057.063.085.095a.073.073 0 0 1 .026.063.076.076 0 0 1-.021.086c-.025.03-.051.06-.08.087a.08.08 0 0 1-.079.028 13.105 13.105 0 0 1-1.874.892.077.077 0 0 0-.041.107c.35.698.764 1.362 1.226 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Discord</h3>
            <p className="mt-1 text-sm text-slate-300">
              {isConnected
                ? `Connected as ${connection?.globalName || connection?.username}${connection?.discriminator ? `#${connection.discriminator}` : ""}`
                : "Join our server and link your account"}
            </p>
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2">
            {connectUrl.startsWith("/discord/connect") ? (
              <a
                href={connectUrl}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-900"
                title="Re-link Discord account"
              >
                Re-link
              </a>
            ) : (
              <Link
                href={connectUrl}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-900"
                title="Re-link Discord account"
              >
                Re-link
              </Link>
            )}
            <button
              onClick={handleDisconnectClick}
              disabled={isPending}
              className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-slate-900"
              title="Disconnect Discord account"
            >
              {isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        )}
      </div>

      {!isConnected && (
        <div className="mt-6 space-y-3 text-sm text-slate-300">
          {serverInviteCode ? (
            <>
              <p className="font-medium text-white">Get started in two steps:</p>
              <ol className="space-y-2 list-decimal list-inside ml-2">
                <li>Join our Discord server to access support and community features</li>
                <li>Link your Discord account to sync your Plex membership status</li>
              </ol>
            </>
          ) : (
            <p>Link your Discord account to connect it with your Plex membership.</p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {serverInviteCode && (
          <a
            href={`https://discord.gg/${serverInviteCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/30 transition hover:bg-[#4752C4] hover:shadow-[#5865F2]/40"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.582.074.074 0 0 1 .06-.053c.05-.025.1-.051.151-.075a.075.075 0 0 1 .079.007c.04.03.08.062.116.098a.077.077 0 0 1 .021.075c-.016.03-.036.06-.054.089a.074.074 0 0 1-.041.034c-.05.012-.102.023-.152.033a.077.077 0 0 0-.058.043c-.047.105-.09.212-.13.321a.076.076 0 0 0 .021.08c.49.49 1.043.905 1.66 1.226a.077.077 0 0 0 .084-.01c.405-.363.765-.77 1.076-1.214a.074.074 0 0 0-.041-.11c-.61-.227-1.19-.52-1.733-.874a.077.077 0 0 1-.007-.128c.12-.09.246-.174.38-.253a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.134.08.26.163.38.253a.077.077 0 0 1-.006.127c-.543.355-1.123.648-1.733.875a.076.076 0 0 0-.041.11c.31.443.67.85 1.075 1.214a.077.077 0 0 0 .084.01c.617-.32 1.17-.736 1.66-1.226a.076.076 0 0 0 .022-.08c-.04-.11-.083-.217-.13-.322a.077.077 0 0 0-.057-.043c-.05-.01-.102-.02-.152-.033a.074.074 0 0 1-.041-.034c-.019-.03-.038-.06-.054-.09a.077.077 0 0 1 .021-.075c.036-.036.075-.068.116-.098a.075.075 0 0 1 .079-.007c.05.024.1.05.151.075a.074.074 0 0 1 .06.053c.026.033.057.063.085.095a.073.073 0 0 1 .026.063.076.076 0 0 1-.021.086c-.025.03-.051.06-.08.087a.08.08 0 0 1-.079.028 13.105 13.105 0 0 1-1.874.892.077.077 0 0 0-.041.107c.35.698.764 1.362 1.226 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Discord Server
          </a>
        )}
        {!isConnected && (
          connectUrl.startsWith("/discord/connect") ? (
            <a
              href={connectUrl}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/30 transition hover:bg-[#4752C4] hover:shadow-[#5865F2]/40"
            >
              Link Discord
            </a>
          ) : (
            <Link
              href={connectUrl}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#5865F2]/30 transition hover:bg-[#4752C4] hover:shadow-[#5865F2]/40"
            >
              Link Discord
            </Link>
          )
        )}
      </div>

      <ConfirmModal
        isOpen={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        onConfirm={handleDisconnectConfirm}
        title="Disconnect Discord Account"
        message="Are you sure you want to disconnect your Discord account? You'll need to link it again to access Discord support features."
        confirmText="Disconnect"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}


