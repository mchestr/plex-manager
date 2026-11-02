"use client"

import { useState } from "react"

import { FindingTriage } from "@/components/admin/ai-activity/review/finding-triage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FindingRow } from "@/lib/data/conversation-findings"
import { FINDING_SEVERITY_LABEL, FINDING_TYPE_LABEL } from "@/lib/ui/finding-labels"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** A finding as `getConversationReview` returns it, with the stored message it points at. */
export type ReviewFinding = FindingRow & { message: { index: number; role: "user" | "assistant"; content: string } }

/** One labelled field of the finding, its text kept as written. */
function Field({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="text-ui whitespace-pre-wrap wrap-anywhere text-foreground">{children}</dd>
    </div>
  )
}

/**
 * The message the finding points at, labelled with the index and role the
 * judge's prompt gave it (`[#7 assistant]`), so a claim citing #7 matches.
 * Clamped to 6 lines until expanded.
 */
function FindingMessage({ findingId, message }: { findingId: string; message: ReviewFinding["message"] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-3">
      <p className="text-label text-muted-foreground">
        Message #{message.index} ({message.role})
      </p>
      <p
        className={cn("text-ui whitespace-pre-wrap wrap-anywhere text-foreground", !expanded && "line-clamp-6")}
        data-testid={`finding-message-${findingId}`}
      >
        {message.content}
      </p>
      <Button
        variant="link"
        size="sm"
        className="h-auto self-start px-0"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        data-testid={`finding-message-toggle-${findingId}`}
      >
        {expanded ? "Show less" : "Show full message"}
      </Button>
    </div>
  )
}

/**
 * One judge finding: type, severity, claim, evidence, suggestion and tool,
 * the message it points at, and its triage. Every judge field is plain text,
 * since it quotes conversations and tool output.
 */
export function FindingCard({ finding }: { finding: ReviewFinding }) {
  const unverified = finding.evidenceCheck === "unverified"
  return (
    <Card data-testid={`finding-card-${finding.id}`}>
      <CardHeader>
        <CardTitle>{FINDING_TYPE_LABEL[finding.type]}</CardTitle>
        <CardDescription>{FINDING_SEVERITY_LABEL[finding.severity]} severity</CardDescription>
        {unverified && (
          <CardAction>
            <Badge variant="warning" icon={icons.warning} data-testid={`finding-unverified-${finding.id}`}>
              Unverified quote
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col gap-3">
          <Field label="Claim">{finding.claim}</Field>
          <Field label="Evidence">{finding.evidenceCheck === "not_applicable" ? "No quote needed" : finding.evidence}</Field>
          <Field label="Suggestion">{finding.suggestion}</Field>
          {finding.tool && <Field label="Tool">{finding.tool}</Field>}
        </dl>
        <FindingMessage findingId={finding.id} message={finding.message} />
        <FindingTriage findingId={finding.id} status={finding.status} note={finding.note} />
      </CardContent>
    </Card>
  )
}
