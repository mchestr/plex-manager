import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getUserPlexWrapped } from "@/actions/users"
import Link from "next/link"
import { WrappedViewerWrapper } from "@/components/wrapped/wrapped-viewer-wrapper"
import { WrappedData } from "@/types/wrapped"
import { WrappedPageClient } from "@/components/wrapped/wrapped-page-client"

export const dynamic = 'force-dynamic'

export default async function WrappedPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  const currentYear = new Date().getFullYear()
  const wrapped = await getUserPlexWrapped(session.user.id, currentYear)

  return (
    <>
      {wrapped && wrapped.status === "completed" && wrapped.data ? (
          (() => {
            try {
              const wrappedData: WrappedData = JSON.parse(wrapped.data)
              return (
                <WrappedViewerWrapper
                  wrappedData={wrappedData}
                  year={currentYear}
                  shareToken={wrapped.shareToken || undefined}
                />
              )
            } catch (error) {
              console.error("Failed to parse wrapped data:", error)
              return (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center">
                  <div className="max-w-md mx-auto">
                    <h2 className="text-2xl font-bold text-white mb-2">Error Loading Wrapped</h2>
                    <p className="text-slate-400 mb-6">
                      There was an error parsing your wrapped data. Please try generating it again.
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
          })()
        ) : wrapped && wrapped.status === "generating" ? (
          <WrappedPageClient userId={session.user.id} year={currentYear} initialStatus="generating" />
        ) : wrapped && wrapped.status === "failed" ? (
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
        ) : (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
            <div className="max-w-md mx-auto">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h2 className="text-2xl font-bold text-white mb-2">No Wrapped Found</h2>
              <p className="text-slate-400 mb-6">
                You haven't generated your {currentYear} Plex Wrapped yet.
              </p>
              <Link
                href="/"
                className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Generate Your Wrapped
              </Link>
            </div>
          </div>
        )}
    </>
  )
}
