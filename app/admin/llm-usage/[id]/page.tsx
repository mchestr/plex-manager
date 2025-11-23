import { getLLMUsageById } from "@/actions/admin"
import { ExpandablePrompt } from "@/components/admin/prompts/expandable-prompt"
import Link from "next/link"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function LLMUsageDetailPage({ params }: { params: { id: string } }) {
  const record = await getLLMUsageById(params.id)

  if (!record) {
    notFound()
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const getProviderBadge = (provider: string) => {
    const colors = {
      openai: "bg-green-500/20 text-green-400",
      mock: "bg-slate-500/20 text-slate-400",
    }
    return (
      <span className={`px-3 py-1.5 ${colors[provider as keyof typeof colors] || "bg-slate-700/50 text-slate-300"} text-sm font-medium rounded`}>
        {provider}
      </span>
    )
  }

  // Try to parse response as JSON for better display
  let formattedResponse: string = record.response
  let isJson = false
  try {
    const parsedResponse = JSON.parse(record.response)
    formattedResponse = JSON.stringify(parsedResponse, null, 2)
    isJson = true
  } catch {
    // Not JSON, will display as text
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Link
              href="/admin/llm-usage"
              className="text-sm text-cyan-400 hover:text-cyan-300 mb-4 inline-block"
            >
              ← Back to LLM Requests
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">LLM Request Details</h1>
            <p className="text-sm text-slate-400">
              Investigate LLM request details, token usage, and response data
            </p>
          </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Provider</div>
            <div className="mt-2">{getProviderBadge(record.provider)}</div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Model</div>
            <div className="text-lg font-bold text-white font-mono">
              {record.model || <span className="text-slate-500">Not specified</span>}
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Tokens</div>
            <div className="text-2xl font-bold text-cyan-400">{record.totalTokens.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">
              {record.promptTokens.toLocaleString()} prompt + {record.completionTokens.toLocaleString()} completion
            </div>
          </div>
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Total Cost</div>
            <div className="text-2xl font-bold text-green-400">${record.cost.toFixed(4)}</div>
            <div className="text-xs text-slate-500 mt-1">
              ${((record.cost / record.totalTokens) * 1000).toFixed(6)} per 1K tokens
            </div>
          </div>
        </div>

        {/* User & Wrapped Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">User Information</h2>
            <div className="flex items-center gap-4 mb-4">
              {record.user.image ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.user.image}
                    alt={record.user.name || "User"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center">
                  <span className="text-slate-400 text-xl font-medium">
                    {(record.user.name || record.user.email || "U")[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <div className="text-lg font-medium text-white">{record.user.name || "Unknown"}</div>
                {record.user.email && (
                  <div className="text-sm text-slate-400">{record.user.email}</div>
                )}
                <Link
                  href="/admin/users"
                  className="text-sm text-cyan-400 hover:text-cyan-300 underline mt-1 inline-block"
                >
                  View All Users
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Wrapped Information</h2>
            {record.wrapped ? (
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-slate-400">Year: </span>
                  <span className="text-sm font-medium text-white">{record.wrapped.year}</span>
                </div>
                <div>
                  <span className="text-sm text-slate-400">Status: </span>
                  <span className="text-sm font-medium text-white">{record.wrapped.status}</span>
                </div>
                {record.wrapped.generatedAt && (
                  <div>
                    <span className="text-sm text-slate-400">Generated: </span>
                    <span className="text-sm text-white">
                      {formatDate(record.wrapped.generatedAt)}
                    </span>
                  </div>
                )}
                <Link
                  href={`/admin/users/${record.userId}/wrapped`}
                  className="text-sm text-cyan-400 hover:text-cyan-300 underline inline-block mt-2"
                >
                  View Wrapped
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not associated with a wrapped</p>
            )}
          </div>
        </div>

        {/* Request Details */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Request Details</h2>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-slate-400 mb-2">Created At</div>
              <div className="text-sm text-white">{formatDate(record.createdAt)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400 mb-2">Token Breakdown</div>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 rounded p-3">
                  <div className="text-xs text-slate-400 mb-1">Prompt Tokens</div>
                  <div className="text-lg font-bold text-blue-400">{record.promptTokens.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900/50 rounded p-3">
                  <div className="text-xs text-slate-400 mb-1">Completion Tokens</div>
                  <div className="text-lg font-bold text-purple-400">{record.completionTokens.toLocaleString()}</div>
                </div>
                <div className="bg-slate-900/50 rounded p-3">
                  <div className="text-xs text-slate-400 mb-1">Total Tokens</div>
                  <div className="text-lg font-bold text-cyan-400">{record.totalTokens.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prompt */}
        <ExpandablePrompt
          content={record.prompt}
          title="Prompt"
          characterCount={record.prompt.length}
        />

        {/* Response */}
        <ExpandablePrompt
          content={formattedResponse}
          title="Response"
          characterCount={record.response.length}
          characterCountSuffix={isJson ? "(JSON formatted)" : undefined}
        />
      </div>
    </div>
  )
}

