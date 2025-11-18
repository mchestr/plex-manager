import { getHistoricalWrappedData } from "@/actions/admin"
import { HistoricalWrappedSelectorHeader } from "@/components/admin/historical-wrapped-selector-header"
import { WrappedViewerWrapper } from "@/components/wrapped-viewer-wrapper"
import { authOptions } from "@/lib/auth"
import { WrappedData } from "@/types/wrapped"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

// Force dynamic rendering to prevent caching
export const dynamic = 'force-dynamic'

export default async function HistoricalWrappedPage({
  params,
}: {
  params: { wrappedId: string; llmUsageId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  if (!session.user.isAdmin) {
    redirect("/")
  }

  const historicalData = await getHistoricalWrappedData(params.llmUsageId, params.wrappedId)

  if (!historicalData) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
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
                    Historical Version Not Found
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Viewing as admin
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="pt-20 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Historical Version Not Found</h2>
              <p className="text-slate-400 mb-6">
                The requested historical wrapped version could not be found or parsed.
              </p>
              <Link
                href="/admin/users"
                className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Back to Users
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const { wrappedData, llmUsage } = historicalData

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <main className="min-h-screen">
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
                  {wrappedData.userName}&apos;s {wrappedData.year} Wrapped
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical Version • {formatDate(llmUsage.createdAt)} • {llmUsage.provider}/{llmUsage.model || "unknown"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <HistoricalWrappedSelectorHeader wrappedId={params.wrappedId} userId={wrappedData.userId} />
            </div>
          </div>
        </div>
      </div>
      <div className="pt-20">
        <div className="max-w-7xl mx-auto px-6 pb-8">
          <WrappedViewerWrapper wrappedData={wrappedData as WrappedData} year={wrappedData.year} />
        </div>
      </div>
    </main>
  )
}

