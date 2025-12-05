"use client"

import { useQuery } from "@tanstack/react-query"
import type { SessionsResponse } from "@/app/api/observability/sessions/route"
import { REFRESH_INTERVALS } from "@/lib/constants/observability"

async function fetchSessions(): Promise<SessionsResponse> {
  const response = await fetch("/api/observability/sessions")
  if (!response.ok) {
    throw new Error("Failed to fetch sessions")
  }
  return response.json()
}

export function ActiveSessionsPanel() {
  const {
    data,
    isLoading,
    isError,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["observability", "sessions"],
    queryFn: fetchSessions,
    refetchInterval: REFRESH_INTERVALS.ACTIVE_SESSIONS,
    staleTime: 5_000,
  })

  if (isLoading) {
    return <SessionsSkeleton />
  }

  if (isError) {
    return (
      <div data-testid="active-sessions-panel" className="p-4 text-center text-red-400 text-sm">
        {error instanceof Error ? error.message : "Failed to load sessions"}
      </div>
    )
  }

  if (!data?.available) {
    return (
      <div data-testid="active-sessions-panel" className="p-4 text-center text-slate-500 text-sm">
        {data?.error || "Tautulli not configured"}
      </div>
    )
  }

  if (data.sessions.length === 0) {
    return (
      <div data-testid="active-sessions-panel" className="p-8 text-center">
        <div className="text-slate-500 text-sm">No active streams</div>
        <div className="text-xs text-slate-600 mt-1">
          Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </div>
      </div>
    )
  }

  const activityUrl = data.tautulliUrl ? `${data.tautulliUrl}/activity` : undefined

  return (
    <div data-testid="active-sessions-panel">
      <div className="divide-y divide-slate-700">
        {data.sessions.map((session) => {
          const Wrapper = activityUrl ? 'a' : 'div'
          const wrapperProps = activityUrl ? {
            href: activityUrl,
            target: "_blank",
            rel: "noopener noreferrer",
          } : {}

          return (
          <Wrapper
            key={session.sessionId}
            className={`p-4 flex items-center gap-4 ${activityUrl ? 'hover:bg-slate-800/50 transition-colors cursor-pointer' : ''}`}
            data-testid={`session-${session.sessionId}`}
            {...wrapperProps}
          >
            {/* User avatar */}
            <div className="shrink-0">
              {session.userThumb ? (
                <img
                  src={session.userThumb}
                  alt={session.user}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-medium">
                  {session.user[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Content info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">
                  {session.grandparentTitle
                    ? `${session.grandparentTitle} - ${session.title}`
                    : session.title}
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    session.state === "playing"
                      ? "bg-green-400 animate-pulse"
                      : session.state === "paused"
                        ? "bg-yellow-400"
                        : "bg-slate-500"
                  }`}
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                <span>{session.user}</span>
                <span>•</span>
                <span>{session.player}</span>
                <span>•</span>
                <span>{session.quality}</span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    session.state === "playing"
                      ? "bg-green-500"
                      : session.state === "paused"
                        ? "bg-yellow-500"
                        : "bg-slate-500"
                  }`}
                  style={{ width: `${session.progress}%` }}
                />
              </div>
            </div>

            {/* Progress percentage */}
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold text-cyan-400">
                {session.progress}%
              </div>
              <div className="text-xs text-slate-500 capitalize">
                {session.state}
              </div>
            </div>
          </Wrapper>
          )
        })}
      </div>
      <div className="p-2 text-center text-xs text-slate-600 border-t border-slate-700">
        {data.streamCount} active stream{data.streamCount !== 1 ? "s" : ""} • Updated{" "}
        {new Date(dataUpdatedAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

function SessionsSkeleton() {
  return (
    <div data-testid="active-sessions-panel" className="divide-y divide-slate-700">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-slate-700 rounded" />
            <div className="h-3 w-32 bg-slate-800 rounded" />
            <div className="h-1 w-full bg-slate-700 rounded" />
          </div>
          <div className="w-12 text-right space-y-1">
            <div className="h-5 w-10 bg-slate-700 rounded ml-auto" />
            <div className="h-3 w-8 bg-slate-800 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  )
}
