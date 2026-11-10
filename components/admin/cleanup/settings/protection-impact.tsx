"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { previewCleanupProtectionImpact } from "@/actions/admin/cleanup-preview"
import { plural } from "@/lib/cleanup/action-words"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { ProtectionImpactResult } from "@/lib/cleanup/types/actions"
import { cn } from "@/lib/utils"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"

/** The impact line waits this long after the last change (UX 7.7 item 4). @internal */
export const IMPACT_DELAY_MS = 500

/** The words of a preview that failed to load. @internal */
export const IMPACT_FAILED = "Could not show the effect of this change. Save still works."

/** One settled preview: of the draft whose JSON is `key`. */
interface Settled {
  key: string
  result: ProtectionImpactResult | null
  error: string | null
}

interface ProtectionImpactState {
  /** The newest settled preview of a draft that differs from the saved values; null before the first. */
  settled: Settled | null
  /** The settled preview is of the current draft. */
  current: boolean
}

/**
 * The impact of a draft of the global protections before Save (TS 10.2
 * `previewCleanupProtectionImpact`, UX 7.7 item 4): it asks 500 ms after the
 * last change, only while the draft is valid and differs from the saved
 * values, and keeps the answer of the newest draft only. Until a new answer
 * settles, the last one stays.
 */
export function useProtectionImpact(draft: ProtectionsOptions | null, dirty: boolean): ProtectionImpactState {
  const key = draft && dirty ? JSON.stringify(draft) : null
  const [settled, setSettled] = useState<Settled | null>(null)
  const latest = useRef(key)
  useLayoutEffect(() => {
    latest.current = key
  })

  useEffect(() => {
    if (key === null) return
    const timer = setTimeout(() => {
      const keep = (next: Settled) => {
        if (latest.current === key) setSettled(next)
      }
      previewCleanupProtectionImpact({ protections: JSON.parse(key) as ProtectionsOptions }).then(
        (result) => keep(result.success ? { key, result: result.data, error: null } : { key, result: null, error: result.error }),
        () => keep({ key, result: null, error: IMPACT_FAILED })
      )
    }, IMPACT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key])

  if (key === null) return { settled: null, current: false }
  return { settled, current: settled?.key === key }
}

/**
 * The clauses after "With this change:" (UX 7.7 item 4, 8.8): each rule
 * whose matches change, "The other rule does not change." for the rest, and
 * "{N} titles leave Leaving soon at the save." above 0. A G13 name that no
 * library read has read yet counts after the next one (TS 5.3 rule 3).
 *
 * @internal Tests check each clause.
 */
export function impactWords(result: ProtectionImpactResult, unreadCollections = false): string {
  const changed = result.rules.filter((rule) => rule.delta !== 0)
  const same = result.rules.length - changed.length
  const clauses = changed.map((rule) => {
    const n = Math.abs(rule.delta)
    return `${rule.name} matches ${n} ${rule.delta > 0 ? "more" : "fewer"} ${nounWord(n, rule.level)}.`
  })
  if (result.rules.length === 0) clauses.push("No rule exists yet.")
  else if (changed.length === 0) clauses.push(result.rules.length === 1 ? `${result.rules[0].name} does not change.` : "No rule changes.")
  else if (same === 1) clauses.push("The other rule does not change.")
  else if (same > 1) clauses.push(`The other ${same} rules do not change.`)
  if (result.leaves > 0) clauses.push(`${plural(result.leaves, "title")} ${result.leaves === 1 ? "leaves" : "leave"} Leaving soon at the save.`)
  if (unreadCollections) clauses.push("A new Plex collection counts after the next library read.")
  return clauses.join(" ")
}

interface ProtectionImpactProps {
  impact: ProtectionImpactState
  /** The draft names a G13 collection that no library read has read yet. */
  unreadCollections: boolean
}

/**
 * The footer line of the Global protections Edit form (UX 4.10, 7.7 item 4,
 * `shots/10-settings-protections-editing.png`): "With this change:" and a
 * clause for each rule. A polite live region that holds only settled text,
 * so a screen reader speaks each answer once and never a half-typed value.
 * It dims while a newer draft waits for its answer.
 */
export function ProtectionImpact({ impact, unreadCollections }: ProtectionImpactProps) {
  const { settled, current } = impact
  const text = settled ? (settled.result ? impactWords(settled.result, unreadCollections) : settled.error) : null
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn("text-label", settled && !current && "opacity-60")}
      data-testid="cleanup-protections-impact"
    >
      {text && (
        <p className="border-t pt-4">
          <span className="font-semibold text-foreground">With this change:</span> <span className="text-muted-foreground">{text}</span>
        </p>
      )}
    </div>
  )
}
