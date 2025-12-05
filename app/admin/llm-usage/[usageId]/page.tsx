import { getLLMUsageById } from "@/actions/admin"
import { ExpandablePrompt } from "@/components/admin/prompts/expandable-prompt"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function LLMUsageDetailPage({ params }: { params: Promise<{ usageId: string }> }) {
  const { usageId } = await params
  const record = await getLLMUsageById(usageId)

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

  // Format prompt nicely - check if it's a chat message array
  let formattedPrompt: string = record.prompt
  let promptIsJson = false
  let promptIsChatMessages = false
  try {
    const parsedPrompt = JSON.parse(record.prompt)
    promptIsJson = true

    // Check if it's an array of chat messages
    if (Array.isArray(parsedPrompt) && parsedPrompt.length > 0) {
      const firstItem = parsedPrompt[0]
      if (typeof firstItem === 'object' && firstItem !== null && ('role' in firstItem || 'content' in firstItem)) {
        promptIsChatMessages = true
        // Format as readable chat messages with separator
        formattedPrompt = parsedPrompt.map((msg: any) => {
          const role = msg.role || 'unknown'
          let content: string

          if (typeof msg.content === 'string') {
            // Check if the string is JSON (common for tool outputs)
            try {
              const parsed = JSON.parse(msg.content)
              content = JSON.stringify(parsed, null, 2)
            } catch {
              // Not JSON, use as-is
              content = msg.content
            }
          } else {
            content = JSON.stringify(msg.content, null, 2)
          }

          const name = msg.name ? ` (${msg.name})` : ''
          return `[${role.toUpperCase()}${name}]\n${content}`
        }).join('\n\n---\n\n')
      } else {
        // Regular JSON array/object
        formattedPrompt = JSON.stringify(parsedPrompt, null, 2)
      }
    } else {
      // Regular JSON object
      formattedPrompt = JSON.stringify(parsedPrompt, null, 2)
    }
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
              {record.totalTokens > 0
                ? `$${((record.cost / record.totalTokens) * 1000000).toFixed(2)} per 1M tokens`
                : "N/A"}
            </div>
          </div>
        </div>

        {/* User & Context Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">User Information</h2>
            <div className="flex items-center gap-4 mb-4">
              {record.user.image ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-700">
                  <Image
                    src={record.user.image}
                    alt={record.user.name || "User"}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                    unoptimized
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
            <h2 className="text-lg font-semibold text-white mb-4">Usage Context</h2>
            {record.wrapped || record.chatConversation ? (
              <div className="space-y-4">
                {record.wrapped && (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400 mb-1">Wrapped</div>
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
                )}
                {record.chatConversation && (
                  <div className="space-y-2">
                    <div className="text-sm text-slate-400 mb-1">Chat Conversation</div>
                    <div className="text-sm text-white">
                      Started {formatDate(record.chatConversation.createdAt)}
                    </div>
                    <Link
                      href={`/admin/llm-usage/conversation/${record.chatConversation.id}`}
                      className="text-sm text-cyan-400 hover:text-cyan-300 underline inline-block mt-2"
                    >
                      View Conversation Calls
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Not associated with a wrapped or chat conversation.
              </p>
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
          content={formattedPrompt}
          title="Prompt"
          characterCount={record.prompt.length}
          characterCountSuffix={promptIsChatMessages ? "(Chat messages)" : promptIsJson ? "(JSON formatted)" : undefined}
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

