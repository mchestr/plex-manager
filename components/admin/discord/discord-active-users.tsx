"use client"

import { Time } from "@/components/ui/time"
import { useFormat } from "@/lib/format-context"

interface ActiveUser {
  discordUserId: string
  discordUsername: string | null
  userId: string | null
  commandCount: number
  lastActiveAt: string
}

interface DiscordActiveUsersProps {
  users: ActiveUser[]
}

export function DiscordActiveUsers({ users }: DiscordActiveUsersProps) {
  const f = useFormat()
  if (users.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No user activity in this period
      </div>
    )
  }

  return (
    <div className="overflow-x-auto" data-testid="discord-active-users">
      <table className="w-full">
        <thead className="bg-slate-700/30 border-b border-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              User
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
              Commands
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
              Last Active
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {users.map((user, index) => (
            <tr
              key={user.discordUserId}
              className="hover:bg-slate-700/20"
              data-testid={`active-user-row-${user.discordUserId}`}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 text-slate-300 text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-300 font-medium">
                      {user.discordUsername ?? "Unknown User"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {user.discordUserId}
                    </span>
                    {user.userId && (
                      <span className="text-xs text-cyan-500">
                        Linked to Plex
                      </span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-lg font-bold text-cyan-400">
                  {f.number(user.commandCount)}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-400">
                <Time value={user.lastActiveAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
