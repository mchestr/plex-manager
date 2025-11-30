import Link from "next/link"
import type { TopUser } from "@/actions/admin"

interface TopUsersWidgetProps {
  users: TopUser[]
}

export function TopUsersWidget({ users }: TopUsersWidgetProps) {
  if (users.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        No user activity data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto" data-testid="top-users-widget">
      <table className="w-full">
        <thead className="bg-slate-700/30 border-b border-slate-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
              User
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
              Requests
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
              Cost
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {users.map((user, index) => (
            <tr
              key={user.userId}
              className="hover:bg-slate-700/20"
              data-testid={`top-user-row-${user.userId}`}
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/users/${user.userId}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-cyan-600 to-purple-600 text-white text-sm font-medium shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt=""
                        className="w-8 h-8 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-medium shrink-0">
                        {(user.name || user.email || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-slate-300 font-medium truncate group-hover:text-cyan-400 transition-colors">
                        {user.name || "Unknown"}
                      </span>
                      {user.email && (
                        <span className="text-xs text-slate-500 truncate">
                          {user.email}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-medium text-purple-400">
                  {user.requests.toLocaleString()}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-medium text-green-400">
                  ${user.cost.toFixed(4)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 border-t border-slate-700 text-center">
        <Link
          href="/admin/llm-usage"
          className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          View all LLM usage →
        </Link>
      </div>
    </div>
  )
}
