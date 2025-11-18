import { getUserPlexWrapped } from "@/actions/users"
import { HistoricalWrappedSelectorHeader } from "@/components/admin/historical-wrapped-selector-header"
import { WrappedPageClient } from "@/components/wrapped-page-client"
import { WrappedViewerWrapper } from "@/components/wrapped-viewer-wrapper"
import { authOptions } from "@/lib/auth"
import { WrappedData } from "@/types/wrapped"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic'

export default async function UserWrappedPage({
  params,
}: {
  params: { userId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  if (!session.user.isAdmin) {
    redirect("/")
  }

  const currentYear = new Date().getFullYear()
  const wrapped = await getUserPlexWrapped(params.userId, currentYear)

  // Admin header component
  const AdminHeader = ({ userName, wrappedId, userId }: { userName?: string | null; wrappedId?: string; userId: string }) => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-slate-700">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Link
              href="/admin/users"
              className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white truncate">
                {userName || "User"}&apos;s {currentYear} Wrapped
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Viewing as admin
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {wrappedId && (
              <HistoricalWrappedSelectorHeader wrappedId={wrappedId} userId={userId} />
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (!wrapped) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
        <AdminHeader userName={null} userId={params.userId} />
        <div className="pt-20 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No wrapped found for this user.</p>
              <Link
                href="/admin/users"
                className="text-cyan-400 hover:text-cyan-300 underline"
              >
                Back to Users
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <AdminHeader userName={wrapped.user.name || wrapped.user.email} wrappedId={wrapped.id} userId={params.userId} />
      <div className="pt-20">
        {wrapped.status === "completed" && wrapped.data ? (
          (() => {
            try {
              const wrappedData: WrappedData = JSON.parse(wrapped.data)
              return (
                <div className="max-w-7xl mx-auto px-6 pb-8">
                  <WrappedViewerWrapper wrappedData={wrappedData} year={currentYear} />
                </div>
              )
            } catch (error) {
              console.error("Failed to parse wrapped data:", error)
              return (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center max-w-2xl mx-auto mt-8">
                  <div className="max-w-md mx-auto">
                    <h2 className="text-2xl font-bold text-white mb-2">Error Loading Wrapped</h2>
                    <p className="text-slate-400 mb-6">
                      There was an error parsing the wrapped data.
                    </p>
                    <Link
                      href="/admin/users"
                      className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
                    >
                      Back to Users
                    </Link>
                  </div>
                </div>
              )
            }
          })()
        ) : wrapped.status === "generating" ? (
          <WrappedPageClient userId={params.userId} year={currentYear} initialStatus="generating" />
        ) : wrapped.status === "failed" ? (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center max-w-2xl mx-auto mt-8">
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
                The wrapped generation failed for this user.
              </p>
              <Link
                href="/admin/users"
                className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Back to Users
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center max-w-2xl mx-auto mt-8">
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
              <h2 className="text-2xl font-bold text-white mb-2">Wrapped Not Ready</h2>
              <p className="text-slate-400 mb-6">
                This user&apos;s wrapped is not available yet.
              </p>
              <Link
                href="/admin/users"
                className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Back to Users
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}


