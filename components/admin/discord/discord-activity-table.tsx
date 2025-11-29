"use client"

import { formatRelativeTime } from "@/lib/utils/time-formatting"

interface ActivityLog {
  id: string
  discordUserId: string
  discordUsername: string | null
  userId: string | null
  commandType: string
  commandName: string
  commandArgs: string | null
  channelId: string
  channelType: string
  guildId: string | null
  status: string
  error: string | null
  responseTimeMs: number | null
  startedAt: string
  completedAt: string | null
  createdAt: string
}

interface DiscordActivityTableProps {
  logs: ActivityLog[]
}

function getStatusBadge(status: string) {
  switch (status) {
    case "SUCCESS":
      return (
        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded">
          Success
        </span>
      )
    case "FAILED":
      return (
        <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded">
          Failed
        </span>
      )
    case "PENDING":
      return (
        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded">
          Pending
        </span>
      )
    case "TIMEOUT":
      return (
        <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded">
          Timeout
        </span>
      )
    default:
      return (
        <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs font-medium rounded">
          {status}
        </span>
      )
  }
}

function getCommandTypeBadge(type: string) {
  switch (type) {
    case "CHAT":
      return (
        <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-medium rounded">
          Chat
        </span>
      )
    case "MEDIA_MARK":
      return (
        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs font-medium rounded">
          Media Mark
        </span>
      )
    case "CLEAR_CONTEXT":
      return (
        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded">
          Clear
        </span>
      )
    case "SELECTION":
      return (
        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded">
          Selection
        </span>
      )
    case "LINK_REQUEST":
      return (
        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded">
          Link
        </span>
      )
    default:
      return (
        <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs font-medium rounded">
          {type}
        </span>
      )
  }
}

export function DiscordActivityTable({ logs }: DiscordActivityTableProps) {
  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        No activity recorded yet
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" data-testid="discord-activity-table">
        <thead className="bg-slate-700/30 border-b border-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              User
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              Command
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              Channel
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
              Response
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-700/20" data-testid={`activity-row-${log.id}`}>
              <td className="px-4 py-3 text-sm text-slate-300">
                <div className="flex flex-col">
                  <span className="text-slate-300">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300 font-medium">
                    {log.discordUsername ?? "Unknown"}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {log.discordUserId}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                {getCommandTypeBadge(log.commandType)}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300 font-mono">
                    {log.commandName}
                  </span>
                  {log.commandArgs && (
                    <span
                      className="text-xs text-slate-500 truncate max-w-[200px]"
                      title={log.commandArgs}
                    >
                      {log.commandArgs}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-slate-400 capitalize">
                  {log.channelType.replace(/-/g, " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  {getStatusBadge(log.status)}
                  {log.error && (
                    <span
                      className="text-xs text-red-400 truncate max-w-[150px]"
                      title={log.error}
                    >
                      {log.error}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-400">
                {log.responseTimeMs != null ? `${log.responseTimeMs}ms` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
