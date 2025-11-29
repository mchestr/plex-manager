"use client"

import { formatRelativeTime } from "@/lib/utils/time-formatting"

interface BotStatus {
  isEnabled: boolean
  botEnabled: boolean
  isConnected: boolean
  instanceId: string | null
  lastRenewedAt: string | null
  expiresAt: string | null
  recentActivityCount: number
  lastCommandAt: string | null
}

interface DiscordBotStatusProps {
  status: BotStatus | null
}

export function DiscordBotStatus({ status }: DiscordBotStatusProps) {
  if (!status) {
    return (
      <div className="mb-6 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-slate-500 animate-pulse" />
          <span className="text-slate-400">Unable to fetch bot status</span>
        </div>
      </div>
    )
  }

  const getStatusIndicator = () => {
    if (!status.isEnabled) {
      return {
        color: "bg-slate-500",
        text: "Disabled",
        description: "Discord integration is disabled",
      }
    }
    if (!status.botEnabled) {
      return {
        color: "bg-yellow-500",
        text: "Bot Disabled",
        description: "Discord bot is disabled in settings",
      }
    }
    if (!status.isConnected) {
      return {
        color: "bg-red-500",
        text: "Disconnected",
        description: "Bot is not connected to Discord",
      }
    }
    return {
      color: "bg-green-500",
      text: "Connected",
      description: "Bot is active and responding",
    }
  }

  const indicator = getStatusIndicator()

  return (
    <div
      className="mb-6 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4"
      data-testid="discord-bot-status"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-4 h-4 rounded-full ${indicator.color}`} />
            {status.isConnected && (
              <div
                className={`absolute inset-0 w-4 h-4 rounded-full ${indicator.color} animate-ping opacity-75`}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{indicator.text}</span>
              {status.isConnected && status.instanceId && (
                <span className="text-xs text-slate-500 font-mono">
                  ({status.instanceId.slice(0, 8)})
                </span>
              )}
            </div>
            <span className="text-sm text-slate-400">
              {indicator.description}
            </span>
          </div>
        </div>

        {/* Activity stats */}
        <div className="flex flex-wrap gap-4 sm:gap-6">
          <div className="text-center">
            <div className="text-lg font-bold text-cyan-400">
              {status.recentActivityCount}
            </div>
            <div className="text-xs text-slate-500">Last hour</div>
          </div>
          {status.lastCommandAt && (
            <div className="text-center">
              <div className="text-lg font-bold text-slate-300">
                {formatRelativeTime(status.lastCommandAt)}
              </div>
              <div className="text-xs text-slate-500">Last command</div>
            </div>
          )}
          {status.isConnected && status.expiresAt && (
            <div className="text-center">
              <div className="text-lg font-bold text-slate-300">
                {formatRelativeTime(status.expiresAt, { addSuffix: false })}
              </div>
              <div className="text-xs text-slate-500">Lock expires in</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
