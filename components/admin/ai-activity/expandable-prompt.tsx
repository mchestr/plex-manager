"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import React, { useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useFormat } from "@/lib/format-context"

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

/** "SYSTEM" reads "System": role names are labels, not caps eyebrows. */
const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ")

function formatChatMessage(
  content: string,
  containerId: string
): { node: React.ReactNode; messages: MessageSection[] } {
  // Check if content is formatted chat messages (contains [ROLE] pattern)
  if (content.match(/^\[[A-Z_]+\]/m)) {
    // Split by separator lines (---) or by [ROLE] pattern at start of line
    const separatorPattern = /\n\n---\n\n/
    const parts = content.split(separatorPattern).filter((p) => p.trim())

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

          return (
            <div
              key={idx}
              id={messageId}
              className="scroll-mt-4 rounded-r border-l-4 border-border-strong bg-secondary py-3 pl-4"
            >
              <div className="mb-2 text-label font-medium text-muted-foreground">
                {roleLabel(role)}
                {name && <span className="ml-1">({name})</span>}
              </div>
              <pre className="text-sm whitespace-pre-wrap font-mono text-foreground overflow-wrap-break-word">
                {messageContent}
              </pre>
            </div>
          )
        }
        return <pre key={idx} className="text-sm text-foreground whitespace-pre-wrap font-mono">{part}</pre>
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

      return (
        <div
          key={idx}
          id={messageId}
          className="scroll-mt-4 rounded-r border-l-4 border-border-strong bg-secondary py-3 pl-4"
        >
          <div className="mb-2 text-label font-medium text-muted-foreground">
            {roleLabel(role)}
            {name && <span className="ml-1">({name})</span>}
          </div>
          <pre className="text-sm whitespace-pre-wrap font-mono text-foreground overflow-wrap-break-word">
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
    node: <pre className="text-sm text-foreground whitespace-pre-wrap font-mono overflow-wrap-break-word">{content}</pre>,
    messages: [],
  }
}

export function ExpandablePrompt({ content, title, characterCount, characterCountSuffix }: ExpandablePromptProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const id = useId()
  const f = useFormat()
  const containerId = `prompt-container-${id.replace(/:/g, "-")}`

  const { node, messages } = useMemo(() => formatChatMessage(content, containerId), [content, containerId])
  const hasMultipleMessages = messages.length > 1

  return (
    <Card className="mb-6" data-testid={`expandable-prompt-${title}`}>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
        <CardAction>
          <Button data-testid="expandable-prompt-toggle" variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} aria-expanded={isExpanded}>
            {isExpanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            <span>{isExpanded ? "Collapse" : "Expand"}</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {hasMultipleMessages && isExpanded && <PromptScrollspy messages={messages} containerId={containerId} />}
        <div
          id={containerId}
          className={`rounded-lg bg-secondary p-4 overflow-x-auto transition-all duration-300 ease-in-out ${
            isExpanded ? "max-h-[5000px]" : "max-h-[300px] overflow-y-auto"
          }`}
        >
          {node}
        </div>
        {characterCount !== undefined && (
          <div className="mt-2 text-xs text-muted-foreground">
            {f.number(characterCount)} characters
            {characterCountSuffix && ` ${characterCountSuffix}`}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

