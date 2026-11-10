import { WhyText } from "@/components/admin/cleanup/results/why-text"
import { Badge } from "@/components/ui/badge"
import type { Verdict } from "@/lib/cleanup/engine/types"
import { joinAnd, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { WhySheetCondition } from "@/lib/cleanup/types/preview"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { cn } from "@/lib/utils"

type Tint = "success" | "destructive" | "warning" | "neutral"

/** A verdict as a tinted word: colour is never the only signal (UX 4.5 item 4, 11.3 item 2). */
export function VerdictBadge({ label, tint, className }: { label: string; tint: Tint; className?: string }) {
  return (
    <Badge variant={tint} className={cn("font-semibold", className)}>
      {label}
    </Badge>
  )
}

/** The verdict words of a condition (UX 8.5). */
const CONDITION_VERDICTS: Record<Verdict, { label: string; tint: Tint }> = {
  pass: { label: "Passes", tint: "success" },
  fail: { label: "Fails", tint: "destructive" },
  unknown: { label: "Unknown", tint: "warning" },
}

/** The threshold as a sentence (TS 6.9): "more than 365 days ago" reads "Needs more than 365 days ago." */
function thresholdLine(threshold: string): string | null {
  const text = threshold.trim()
  if (text === "") return null
  const sentence = /^needs\b/i.test(text) ? text : `Needs ${text}`
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

/** Where a value came from: "From Plex and Radarr.", or "Tautulli did not answer." */
function sourcesLine(sources: readonly SourceStatus[]): string | null {
  const names = (state: SourceStatus["state"]) => [...new Set(sources.filter((s) => s.state === state).map((s) => SERVICE_NAMES[s.service]))]
  const failed = names("failed")
  if (failed.length > 0) return `${joinAnd(failed)} did not answer.`
  const read = names("ok")
  return read.length > 0 ? `From ${joinAnd(read)}.` : null
}

function Members({ members }: { members: NonNullable<WhySheetCondition["members"]> }) {
  return (
    <ul className="mt-2 flex flex-col gap-2 border-l pl-3">
      {members.map((member) => {
        const verdict = CONDITION_VERDICTS[member.verdict]
        return (
          <li key={member.id} className="flex items-start gap-2">
            <VerdictBadge label={verdict.label} tint={verdict.tint} />
            <WhyText parts={member.value} className="text-ui" />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The Conditions of the Why Sheet (UX 4.5): one line for each condition or
 * group, with its verdict as a word, the condition, the real value with its
 * date, and the threshold with its sources. A group lists its members and
 * which of them passed.
 */
export function WhyConditions({ conditions }: { conditions: readonly WhySheetCondition[] }) {
  if (conditions.length === 0) return null
  return (
    <div className="flex flex-col gap-1" data-testid="admin-cleanup-why-conditions">
      <h3 className="text-ui font-semibold text-foreground">Conditions</h3>
      <ul className="divide-y">
        {conditions.map((condition) => {
          const verdict = CONDITION_VERDICTS[condition.verdict]
          const note = [thresholdLine(condition.threshold), sourcesLine(condition.sources)].filter(Boolean).join(" ")
          return (
            <li
              key={condition.id}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 py-3 text-ui"
              data-testid={`admin-cleanup-why-condition-${condition.id}`}
            >
              <VerdictBadge label={verdict.label} tint={verdict.tint} className="mt-0.5" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-semibold text-foreground">{condition.label}</p>
                <WhyText parts={condition.value} className="text-foreground" />
                {note && <p className="text-label text-muted-foreground">{note}</p>}
                {condition.members && condition.members.length > 0 && <Members members={condition.members} />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
