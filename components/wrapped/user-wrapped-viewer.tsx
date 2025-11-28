import { Prisma } from "@prisma/client"
import Link from "next/link"
import { WrappedGeneratingAnimation } from "@/components/generator/wrapped-generating-animation"
import { formatWatchTime } from "@/lib/utils/time-formatting"

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

interface UserWrappedViewerProps {
  wrapped: WrappedWithUser
}

export function UserWrappedViewer({ wrapped }: UserWrappedViewerProps) {
  let wrappedData: any = null
  try {
    wrappedData = JSON.parse(wrapped.data)
  } catch (error) {
    console.error("Failed to parse wrapped data:", error)
  }

  if (wrapped.status === "generating") {
    return <WrappedGeneratingAnimation year={wrapped.year} compact />
  }

  if (wrapped.status === "failed") {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-2">Generation Failed</h2>
          {wrapped.error && (
            <p className="text-red-300 mb-4">{wrapped.error}</p>
          )}
          <p className="text-slate-400 mb-6">
            There was an error generating your wrapped. Please try again.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Try Again
          </Link>
        </div>
      </div>
    )
  }

  if (wrapped.status === "pending") {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-bold text-white mb-2">Wrapped Pending</h2>
          <p className="text-slate-400 mb-6">
            Your wrapped generation is pending. Please check back soon!
          </p>
        </div>
      </div>
    )
  }

  if (wrapped.status !== "completed" || !wrappedData) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-bold text-white mb-2">Wrapped Not Ready</h2>
          <p className="text-slate-400 mb-6">
            Your wrapped data is not available yet. Please try generating it again.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Generate Your Wrapped
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-cyan-600/20 via-purple-600/20 to-pink-600/20 backdrop-blur-sm border border-slate-700 rounded-lg p-8 text-center">
        <h2 className="text-3xl font-bold text-white mb-2">
          Your {wrapped.year} Plex Year in Review
        </h2>
        {wrapped.generatedAt && (
          <p className="text-slate-400 text-sm">
            Generated on {new Date(wrapped.generatedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Watch Time */}
        {wrappedData.totalWatchTime !== undefined && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Total Watch Time</h3>
            <p className="text-3xl font-bold text-white">
              {formatWatchTime(wrappedData.totalWatchTime)}
            </p>
          </div>
        )}

        {/* Top Movies Count */}
        {wrappedData.topMovies && Array.isArray(wrappedData.topMovies) && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Movies Watched</h3>
            <p className="text-3xl font-bold text-white">{wrappedData.topMovies.length}</p>
          </div>
        )}

        {/* Top Shows Count */}
        {wrappedData.topShows && Array.isArray(wrappedData.topShows) && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Shows Watched</h3>
            <p className="text-3xl font-bold text-white">{wrappedData.topShows.length}</p>
          </div>
        )}
      </div>

      {/* Top Movies */}
      {wrappedData.topMovies && Array.isArray(wrappedData.topMovies) && wrappedData.topMovies.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Top Movies</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wrappedData.topMovies.map((movie: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-cyan-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-2xl font-bold text-cyan-400">#{idx + 1}</span>
                </div>
                <p className="text-white font-medium text-lg">{movie.title || `Movie ${idx + 1}`}</p>
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
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Top Shows</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wrappedData.topShows.map((show: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-700/30 rounded-lg p-4 border border-slate-600 hover:border-purple-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-2xl font-bold text-purple-400">#{idx + 1}</span>
                </div>
                <p className="text-white font-medium text-lg">{show.title || `Show ${idx + 1}`}</p>
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

      {/* Placeholder for future content */}
      {(!wrappedData.topMovies || wrappedData.topMovies.length === 0) &&
        (!wrappedData.topShows || wrappedData.topShows.length === 0) && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
            <p className="text-slate-400">
              Your wrapped data is being prepared. More statistics will appear here soon!
            </p>
          </div>
        )}
    </div>
  )
}

