"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { useFormat } from "@/lib/format-context"

interface ConversationUsageRowProps {
  record: {
    id: string
    createdAt: Date
    model: string | null
    totalTokens: number
    promptTokens: number
    completionTokens: number
    cost: number
    /** Nullable since the October 2026 privacy clean-up (P0.20); chat calls keep their text. */
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

export function ConversationUsageRow({
  record,
  index,
}: ConversationUsageRowProps) {
  const router = useRouter()
  const f = useFormat()
  const promptSnippet = getLastUserSnippet(record.prompt)

  const handleRowClick = () => {
    router.push(`/admin/llm-usage/${record.id}`)
  }

  return (
    <tr
      data-testid={`conversation-usage-row-${record.id}`}
      onClick={handleRowClick}
      className="hover:bg-slate-700/20 transition-colors cursor-pointer group"
    >
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-slate-300">
        #{index + 1}
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <div className="text-xs sm:text-sm text-slate-300">
          {f.dateTime(record.createdAt)}
        </div>
        {promptSnippet && (
          <div className="mt-1 text-[11px] text-slate-500 line-clamp-1">
            <span className="uppercase tracking-wide mr-1">User:</span>
            {promptSnippet}
          </div>
        )}
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
        <div className="text-sm text-slate-300 font-mono truncate max-w-[160px]">
          {record.model || <span className="text-slate-500">—</span>}
        </div>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <div className="text-sm">
          <div className="text-white font-medium">
            {f.number(record.totalTokens)}
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">
            {f.number(record.promptTokens)} +{" "}
            {f.number(record.completionTokens)}
          </div>
        </div>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-green-400 font-medium">
          {f.money(record.cost)}
        </div>
      </td>
      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
        <Link
          href={`/admin/llm-usage/${record.id}`}
          onClick={(e) => e.stopPropagation()}
          className="px-2 sm:px-3 py-1 sm:py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-medium rounded transition-colors inline-block"
        >
          View Request →
        </Link>
      </td>
    </tr>
  )
}

