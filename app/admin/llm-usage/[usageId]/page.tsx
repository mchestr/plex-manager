import { getLLMUsageById } from "@/lib/data/llm-usage"
import { LlmTextRemovedNotice } from "@/components/admin/llm-usage/llm-text-removed-notice"
import { ExpandablePrompt } from "@/components/admin/prompts/expandable-prompt"
import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { getFormat } from "@/lib/settings/app-settings"
import { llmConversation, llmUsage, userDetail, userRewind } from "@/lib/admin/routes"

export const dynamic = 'force-dynamic'

export default async function LLMUsageDetailPage({ params }: { params: Promise<{ usageId: string }> }) {
  const { usageId } = await params
  const [record, f] = await Promise.all([getLLMUsageById(usageId), getFormat()])

  if (!record) {
    notFound()
  }

  // Try to parse response as JSON for better display. Prompt and response are
  // null on rows the October 2026 privacy clean-up stripped (P0.20).
  let formattedResponse = record.response ?? ""
  let isJson = false
  try {
    const parsedResponse = JSON.parse(formattedResponse)
    formattedResponse = JSON.stringify(parsedResponse, null, 2)
    isJson = true
  } catch {
    // Not JSON, will display as text
  }

  // Format prompt nicely - check if it's a chat message array
  let formattedPrompt = record.prompt ?? ""
  let promptIsJson = false
  let promptIsChatMessages = false
  try {
    const parsedPrompt = JSON.parse(formattedPrompt)
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
              data-testid="admin-llm-usage-back"
              href="/admin/llm-usage"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline mb-4 inline-block"
            >
              Back to LLM usage
            </Link>
            <h1 data-testid="admin-llm-usage-detail-heading" className="text-2xl sm:text-3xl font-bold text-foreground mb-2">LLM Request Details</h1>
            <p className="text-sm text-muted-foreground">
              Investigate LLM request details, token usage, and response data
            </p>
          </div>

        <StatGrid className="mb-6">
          <StatTile label="Provider" value={record.provider} />
          <StatTile label="Model" value={record.model || "Not specified"} />
          <StatTile
            label="Total tokens"
            value={f.number(record.totalTokens)}
            meta={`${f.number(record.promptTokens)} prompt + ${f.number(record.completionTokens)} completion`}
          />
          <StatTile
            label="Total cost"
            value={f.money(record.cost)}
            meta={record.totalTokens > 0 ? `${f.money((record.cost / record.totalTokens) * 1000000)} per 1M tokens` : undefined}
          />
        </StatGrid>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle as="h2">User Information</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="flex items-center gap-4">
              {record.user.image ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-secondary">
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
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-muted-foreground text-xl font-medium">
                    {(record.user.name || record.user.email || "U")[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <div className="text-lg font-medium text-foreground">{record.user.name || "Unknown"}</div>
                {record.user.email && (
                  <div className="text-sm text-muted-foreground">{record.user.email}</div>
                )}
                <Link
                  data-testid="admin-llm-usage-member"
                  href={userDetail(record.user.id)}
                  className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground mt-1 inline-block"
                >
                  View user
                </Link>
                <Link
                  href={llmUsage({ userId: record.userId, year: record.wrapped?.year })}
                  className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground mt-1 ml-4 inline-block"
                  data-testid="llm-usage-detail-view-all"
                >
                  View all
                </Link>
              </div>
            </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Usage Context</CardTitle>
            </CardHeader>
            <CardContent>
            {record.wrapped || record.chatConversation ? (
              <div className="space-y-4">
                {record.wrapped && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-1">Rewind</div>
                    <div>
                      <span className="text-sm text-muted-foreground">Year: </span>
                      <span className="text-sm font-medium text-foreground">{record.wrapped.year}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Status: </span>
                      <span className="text-sm font-medium text-foreground">{record.wrapped.status}</span>
                    </div>
                    {record.wrapped.generatedAt && (
                      <div>
                        <span className="text-sm text-muted-foreground">Generated: </span>
                        <span className="text-sm text-foreground">
                          {f.dateTime(record.wrapped.generatedAt, { zoneLabel: true })}
                        </span>
                      </div>
                    )}
                    <Link
                      data-testid="admin-llm-usage-rewind"
                      href={userRewind(record.userId, record.wrapped.year)}
                      className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground inline-block mt-2"
                    >
                      View Rewind
                    </Link>
                  </div>
                )}
                {record.chatConversation && (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-1">Chat Conversation</div>
                    <div className="text-sm text-foreground">
                      Started {f.dateTime(record.chatConversation.createdAt, { zoneLabel: true })}
                    </div>
                    <Link
                      data-testid="admin-llm-usage-conversation"
                      href={llmConversation(record.chatConversation.id)}
                      className="text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground inline-block mt-2"
                    >
                      View Conversation Calls
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not associated with a wrapped or chat conversation.
              </p>
            )}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle as="h2">Request Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-2">Created At</div>
            <div className="text-sm text-foreground">{f.dateTime(record.createdAt, { zoneLabel: true })}</div>
          </CardContent>
        </Card>

        {/* Prompt */}
        {record.prompt === null ? (
          <LlmTextRemovedNotice title="Prompt" />
        ) : (
          <ExpandablePrompt
            content={formattedPrompt}
            title="Prompt"
            characterCount={record.prompt.length}
            characterCountSuffix={promptIsChatMessages ? "(Chat messages)" : promptIsJson ? "(JSON formatted)" : undefined}
          />
        )}

        {/* Response */}
        {record.response === null ? (
          <LlmTextRemovedNotice title="Response" />
        ) : (
          <ExpandablePrompt
            content={formattedResponse}
            title="Response"
            characterCount={record.response.length}
            characterCountSuffix={isJson ? "(JSON formatted)" : undefined}
          />
        )}
      </div>
    </div>
  )
}

