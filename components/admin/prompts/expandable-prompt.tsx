"use client"

import React, { useId, useMemo, useState } from "react"
import { PromptScrollspy } from "./prompt-scrollspy"

interface ExpandablePromptProps {
  content: string
  title: string
  characterCount?: number
  characterCountSuffix?: string
}

interface MessageSection {
  id: string
  role: string
  name?: string
  index: number
}

function formatChatMessage(
  content: string,
  containerId: string
): { node: React.ReactNode; messages: MessageSection[] } {
  // Check if content is formatted chat messages (contains [ROLE] pattern)
  if (content.match(/^\[[A-Z_]+\]/m)) {
    // Split by separator lines (---) or by [ROLE] pattern at start of line
    const separatorPattern = /\n\n---\n\n/
    const parts = content.split(separatorPattern).filter((p) => p.trim())

    const roleColors: Record<string, { text: string; bg: string; border: string }> = {
      SYSTEM: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
      USER: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
      ASSISTANT: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
      TOOL: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
    }

    const messages: MessageSection[] = []

    const nodes = parts.map((part, idx) => {
      const roleMatch = part.match(/^\[([A-Z_]+)(?: \(([^)]+)\))?\]/)
      if (!roleMatch) {
        // Fallback: try to find role anywhere in the part
        const fallbackMatch = part.match(/\[([A-Z_]+)(?: \(([^)]+)\))?\]/)
        if (fallbackMatch) {
          const [, role, name] = fallbackMatch
          const messageId = `${containerId}-message-${idx}`
          messages.push({ id: messageId, role, name, index: idx })

          let messageContent = part.replace(/.*?\[[^\]]+\]\n/, "").trim()

          // Format JSON strings in tool outputs
          if (role === "TOOL" && messageContent) {
            try {
              const parsed = JSON.parse(messageContent)
              messageContent = JSON.stringify(parsed, null, 2)
            } catch {
              // Not JSON, use as-is
            }
          }

          const colors = roleColors[role] || {
            text: "text-slate-400",
            bg: "bg-slate-700/30",
            border: "border-slate-600/30",
          }

          return (
            <div
              key={idx}
              id={messageId}
              className={`border-l-4 ${colors.border} pl-4 py-3 ${colors.bg} rounded-r scroll-mt-4`}
            >
              <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${colors.text}`}>
                {role}
                {name && <span className="text-slate-400 normal-case ml-1">({name})</span>}
              </div>
              <pre className={`text-sm whitespace-pre-wrap font-mono ${colors.text} overflow-wrap-break-word`}>
                {messageContent}
              </pre>
            </div>
          )
        }
        return <pre key={idx} className="text-sm text-slate-300 whitespace-pre-wrap font-mono">{part}</pre>
      }

      const [, role, name] = roleMatch
      const messageId = `${containerId}-message-${idx}`
      messages.push({ id: messageId, role, name, index: idx })

      let messageContent = part.replace(/^\[[^\]]+\]\n/, "").trim()

      // Format JSON strings in tool outputs
      if (role === "TOOL" && messageContent) {
        try {
          const parsed = JSON.parse(messageContent)
          messageContent = JSON.stringify(parsed, null, 2)
        } catch {
          // Not JSON, use as-is
        }
      }

      const colors = roleColors[role] || {
        text: "text-slate-400",
        bg: "bg-slate-700/30",
        border: "border-slate-600/30",
      }

      return (
        <div
          key={idx}
          id={messageId}
          className={`border-l-4 ${colors.border} pl-4 py-3 ${colors.bg} rounded-r scroll-mt-4`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${colors.text}`}>
            {role}
            {name && <span className="text-slate-400 normal-case ml-1">({name})</span>}
          </div>
          <pre className={`text-sm whitespace-pre-wrap font-mono ${colors.text} overflow-wrap-break-word`}>
            {messageContent}
          </pre>
        </div>
      )
    })

    return {
      node: <div className="space-y-4">{nodes}</div>,
      messages,
    }
  }

  // Regular content
  return {
    node: <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono overflow-wrap-break-word">{content}</pre>,
    messages: [],
  }
}

export function ExpandablePrompt({ content, title, characterCount, characterCountSuffix }: ExpandablePromptProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const id = useId()
  const containerId = `prompt-container-${id.replace(/:/g, "-")}`

  const { node, messages } = useMemo(() => formatChatMessage(content, containerId), [content, containerId])
  const hasMultipleMessages = messages.length > 1

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
        >
          <span>{isExpanded ? "Collapse" : "Expand"}</span>
          <span className="text-xs">{isExpanded ? "↑" : "↓"}</span>
        </button>
      </div>
      {hasMultipleMessages && isExpanded && (
        <PromptScrollspy messages={messages} containerId={containerId} />
      )}
      <div
        id={containerId}
        className={`bg-slate-900/50 rounded-lg p-4 overflow-x-auto transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-[5000px]" : "max-h-[300px] overflow-y-auto"
        }`}
      >
        {node}
      </div>
      {characterCount !== undefined && (
        <div className="mt-2 text-xs text-slate-500">
          {characterCount.toLocaleString()} characters
          {characterCountSuffix && ` ${characterCountSuffix}`}
        </div>
      )}
    </div>
  )
}

