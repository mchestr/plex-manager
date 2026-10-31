import Link from "next/link"

import { llmUsageDetail } from "@/lib/admin/routes"

interface ConversationUsageRowProps {
  record: {
    id: string
    /** Formatted on the server in `Config.timezone`, with the zone (GAP-43). */
    time: string
    model: string | null
    totalTokens: string
    tokenSplit: string
    cost: string
    /** Null when the text isn't kept (`LlmTextRemovedNotice`): the retention sweep clears it, or the October 2026 clean-up did (P0.20). */
    prompt: string | null
  }
  index: number
}

function getLastUserSnippet(prompt: string | null, maxLength: number = 80): string | null {
  if (prompt === null) return null
  try {
    const parsed = JSON.parse(prompt) as Array<{ role?: string; content?: unknown }>
    if (!Array.isArray(parsed)) return null
    const userMessages = parsed.filter((m) => m.role === "user" && typeof m.content === "string")
    const last = userMessages[userMessages.length - 1]
    if (!last || typeof last.content !== "string") return null
    const trimmed = last.content.trim()
    if (!trimmed) return null
    if (trimmed.length <= maxLength) return trimmed
    return trimmed.slice(0, maxLength - 1) + "…"
  } catch {
    return null
  }
}

/** One call of a conversation: the first cell links to the request (no row click, UI-23). */
export function ConversationUsageRow({ record, index }: ConversationUsageRowProps) {
  const promptSnippet = getLastUserSnippet(record.prompt)

  return (
    <tr data-testid={`conversation-usage-row-${record.id}`} className="hover:bg-accent/40">
      <td className="px-4 py-3 whitespace-nowrap">
        <Link data-testid={`admin-llm-conversation-call-${record.id}`} href={llmUsageDetail(record.id)} className="rounded-sm font-medium text-foreground hover:underline" aria-label={`Call ${index + 1}, ${record.time}`}>
          #{index + 1}
        </Link>
      </td>
      <td className="px-4 py-3">
        <div className="whitespace-nowrap text-foreground" data-testid={`conversation-usage-time-${record.id}`}>
          {record.time}
        </div>
        {promptSnippet && (
          <div className="mt-1 line-clamp-1 text-caption text-muted-foreground">
            <span className="mr-1">User:</span>
            {promptSnippet}
          </div>
        )}
      </td>
      <td className="hidden px-4 py-3 font-mono text-muted-foreground lg:table-cell">{record.model || "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        <div className="text-foreground">{record.totalTokens}</div>
        <div className="hidden text-caption text-muted-foreground sm:block">{record.tokenSplit}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{record.cost}</td>
    </tr>
  )
}
