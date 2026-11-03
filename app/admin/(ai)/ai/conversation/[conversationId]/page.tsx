import { MessagesSquare } from "lucide-react"

import { getConversationReview } from "@/lib/data/conversation-review"
import { getLLMUsageRecords } from "@/lib/data/llm-usage"
import { ConversationTranscript } from "@/components/admin/ai-activity/conversation-transcript"
import { ConversationUsageRow } from "@/components/admin/ai-activity/conversation-usage-row"
import { LlmTextRemovedNotice } from "@/components/admin/ai-activity/llm-text-removed-notice"
import { ReviewSection } from "@/components/admin/ai-activity/review/review-section"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatGrid, StatTile } from "@/components/ui/stat-tile"
import { aiActivity } from "@/lib/admin/routes"
import { getFormat } from "@/lib/settings/app-settings"
import { aggregateLlmUsage } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"
import { dayKey } from "@/lib/utils/zoned-time"
import { assertAdmin } from "@/lib/admin"

/** "Oct 12, 2026, 2:26 PM CDT to 2:28 PM", or both dates when the range spans days; always in `Config.timezone` (GAP-43). */
function formatTimeRange(start: Date, end: Date, f: BoundFormat) {
  const { timeZone } = f.settings
  const sameDay = dayKey(start.getTime(), timeZone) === dayKey(end.getTime(), timeZone)
  const from = f.dateTime(start, { zoneLabel: true })
  return sameDay ? `${from} to ${f.time(end)}` : `${from} to ${f.dateTime(end, { zoneLabel: true })}`
}

function getDurationLabel(start: Date, end: Date) {
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return seconds % 60 > 0 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return minutes % 60 > 0 ? `${hours}h ${minutes % 60}m` : `${hours}h`
}

const HEADINGS = ["#", "Time", "Model", "Tokens", "Cost"]

/**
 * One chat conversation's LLM calls (P10.6): breadcrumbs, server-formatted
 * zoned times and the transcript, with the judge's Review section above it
 * for a reviewable admin assistant conversation. The section belongs to the
 * `ChatConversation`, not its calls, so it shows on "No calls" too.
 */
export default async function LLMConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  await assertAdmin()
  const { conversationId } = await params
  const [{ records }, f, judged] = await Promise.all([
    getLLMUsageRecords({ pageSize: 100, conversationId }),
    getFormat(),
    getConversationReview(conversationId),
  ])
  const reviewSection = judged.reviewable && (
    <ReviewSection
      key={conversationId}
      conversationId={conversationId}
      review={judged.review}
      findings={judged.findings}
      hasToolEvidence={judged.hasToolEvidence}
      judgeConfigured={judged.judgeConfigured}
    />
  )

  if (!records.length) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          breadcrumbs={[{ label: "AI activity", href: aiActivity() }, { label: "Conversation" }]}
          title="Conversation"
          data-testid="admin-ai-conversation-heading"
        />
        {reviewSection}
        <EmptyState kind="first-use" icon={MessagesSquare} title="No calls" />
      </div>
    )
  }

  const summary = aggregateLlmUsage(records)
  const user = records[0].user
  const name = user.name || user.email || "Unknown member"
  const times = records.map((r) => r.createdAt.getTime())
  const startedAt = new Date(Math.min(...times))
  const endedAt = new Date(Math.max(...times))
  const latestRecord = records.reduce((latest, r) => (r.createdAt > latest.createdAt ? r : latest), records[0])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        breadcrumbs={[{ label: "AI activity", href: aiActivity() }, { label: name, href: aiActivity({ userId: user.id }) }, { label: "Conversation" }]}
        title={`${name}'s conversation`}
        data-testid="admin-ai-conversation-heading"
      />

      <StatGrid data-testid="admin-ai-conversation-summary">
        <StatTile
          label="Calls"
          value={f.number(records.length)}
          meta={
            <span data-testid="admin-ai-conversation-range">
              {formatTimeRange(startedAt, endedAt, f)} ({getDurationLabel(startedAt, endedAt)})
            </span>
          }
        />
        <StatTile label="Cost" value={f.money(summary?.cost ?? 0)} meta={summary?.model ?? undefined} />
        <StatTile
          label="Tokens"
          value={f.number(summary?.totalTokens ?? 0)}
          meta={`${f.number(summary?.promptTokens ?? 0)} prompt + ${f.number(summary?.completionTokens ?? 0)} completion`}
        />
      </StatGrid>

      {reviewSection}

      {latestRecord.prompt === null ? (
        <LlmTextRemovedNotice title="Latest prompt" />
      ) : (
        <ConversationTranscript prompt={latestRecord.prompt} />
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table aria-label="Calls in this conversation" className="w-full border-collapse text-ui">
          <thead className="border-b">
            <tr>
              {HEADINGS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className={`h-10 px-4 text-label font-medium whitespace-nowrap text-muted-foreground ${label === "Tokens" || label === "Cost" ? "text-right" : "text-left"} ${label === "Model" ? "hidden lg:table-cell" : ""}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((record, index) => (
              <ConversationUsageRow
                key={record.id}
                index={index}
                record={{
                  id: record.id,
                  time: f.dateTime(record.createdAt, { zoneLabel: true }),
                  model: record.model,
                  totalTokens: f.number(record.totalTokens),
                  tokenSplit: `${f.number(record.promptTokens)} + ${f.number(record.completionTokens)}`,
                  cost: f.money(record.cost),
                  prompt: record.prompt,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
