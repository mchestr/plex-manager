import { Prisma } from "@/lib/generated/prisma/client"

type WrappedWithUser = Prisma.PlexWrappedGetPayload<{
  include: {
    user: {
      select: {
        id: true
        name: true
        email: true
        image: true
      }
    }
  }
}>

interface WrappedViewerProps {
  wrapped: WrappedWithUser
}

export function WrappedViewer({ wrapped }: WrappedViewerProps) {
  let wrappedData: any = null
  try {
    wrappedData = JSON.parse(wrapped.data)
  } catch (error) {
    console.error("Failed to parse wrapped data:", error)
  }

  const getStatusBadge = () => {
    switch (wrapped.status) {
      case "completed":
        return (
          <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-medium rounded-full">
            Completed
          </span>
        )
      case "generating":
        return (
          <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm font-medium rounded-full">
            Generating
          </span>
        )
      case "failed":
        return (
          <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm font-medium rounded-full">
            Failed
          </span>
        )
      case "pending":
        return (
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm font-medium rounded-full">
            Pending
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Status and Metadata */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Wrapped Status</h2>
          {getStatusBadge()}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Year:</span>
            <span className="text-white ml-2 font-medium">{wrapped.year}</span>
          </div>
          {wrapped.generatedAt && (
            <div>
              <span className="text-slate-400">Generated:</span>
              <span className="text-white ml-2 font-medium">
                {new Date(wrapped.generatedAt).toLocaleString()}
              </span>
            </div>
          )}
          <div>
            <span className="text-slate-400">Created:</span>
            <span className="text-white ml-2 font-medium">
              {new Date(wrapped.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        {wrapped.error && (
          <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-md">
            <p className="text-red-300 text-sm font-medium mb-1">Error:</p>
            <p className="text-red-200 text-sm">{wrapped.error}</p>
          </div>
        )}
      </div>

      {/* Wrapped Data */}
      {wrapped.status === "completed" && wrappedData ? (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Wrapped Data</h2>
          <div className="space-y-6">
            {/* Basic Info */}
            {wrappedData.userName && (
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">User</h3>
                <p className="text-lg text-white">{wrappedData.userName}</p>
              </div>
            )}

            {/* Top Movies */}
            {wrappedData.topMovies && Array.isArray(wrappedData.topMovies) && wrappedData.topMovies.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3">Top Movies</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wrappedData.topMovies.map((movie: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-700/30 rounded-lg p-4 border border-slate-600"
                    >
                      <p className="text-white font-medium">{movie.title || `Movie ${idx + 1}`}</p>
                      {movie.watchTime && (
                        <p className="text-slate-400 text-sm mt-1">
                          {movie.watchTime} watched
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Shows */}
            {wrappedData.topShows && Array.isArray(wrappedData.topShows) && wrappedData.topShows.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-3">Top Shows</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {wrappedData.topShows.map((show: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-slate-700/30 rounded-lg p-4 border border-slate-600"
                    >
                      <p className="text-white font-medium">{show.title || `Show ${idx + 1}`}</p>
                      {show.watchTime && (
                        <p className="text-slate-400 text-sm mt-1">
                          {show.watchTime} watched
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total Watch Time */}
            {wrappedData.totalWatchTime !== undefined && (
              <div>
                <h3 className="text-sm font-medium text-slate-400 mb-2">Total Watch Time</h3>
                <p className="text-2xl font-bold text-white">
                  {formatWatchTime(wrappedData.totalWatchTime)}
                </p>
              </div>
            )}

            {/* Raw Data View */}
            <div>
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-slate-400 hover:text-white transition-colors">
                  View Raw JSON Data
                </summary>
                <div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700 overflow-x-auto">
                  <pre className="text-xs text-slate-300">
                    {JSON.stringify(wrappedData, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          </div>
        </div>
      ) : wrapped.status === "completed" ? (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400">Wrapped data is empty or invalid.</p>
        </div>
      ) : null}
    </div>
  )
}

function formatWatchTime(minutes: number): string {
  if (!minutes || minutes === 0) return "0 minutes"

  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`)
  if (remainingHours > 0) parts.push(`${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`)
  if (remainingMinutes > 0 && days === 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`)
  }

  return parts.join(", ") || "0 minutes"
}

