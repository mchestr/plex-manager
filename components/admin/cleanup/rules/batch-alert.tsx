"use client"

import Link from "next/link"

import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { dayWords } from "@/components/admin/cleanup/rules/rule-card-facts"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cleanup } from "@/lib/admin/routes"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { OverviewBatch } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** The one level of the batches, else "title". */
const nounOf = (batches: readonly OverviewBatch[]): Level | "title" => {
  const levels = new Set(batches.map((batch) => batch.level))
  return levels.size === 1 ? batches[0].level : "title"
}

/** One sentence per deletion batch (UX 8.2): due today, or "between {day} and {day}" for titles that reached it earlier. */
function deletionSentence(batch: OverviewBatch, f: BoundFormat, today: string): string {
  const size = sizeText(batch.bytes)
  if (batch.dueSince >= today) return `${batch.ruleName} reached the leave date today: ${size}.`
  if (batch.dueSince === batch.dueAt) return `${batch.ruleName} has titles that reached their leave date on ${dayWords(f, batch.dueSince, today)}: ${size}.`
  return `${batch.ruleName} has titles that reached their leave date between ${dayWords(f, batch.dueSince, today)} and ${dayWords(f, batch.dueAt, today)}: ${size}.`
}

/**
 * The batch alert of the Rules tab (UX 4.1.2, 8.2), shown only while a batch
 * waits. Deletion batches come first: "6 shows wait for your approval", one
 * sentence per batch, and "Review the batch". With only entry batches: "52
 * new matches wait to join Leaving soon" and "Review the matches". Both open
 * the Leaving soon tab.
 */
export function BatchAlert({ batches, today }: { batches: readonly OverviewBatch[]; today: string }) {
  const f = useFormat()
  const deletion = batches.filter((batch) => batch.kind === "deletion")
  const shown = deletion.length > 0 ? deletion : batches
  if (shown.length === 0) return null
  const count = shown.reduce((sum, batch) => sum + batch.count, 0)
  const isDeletion = deletion.length > 0
  const title = isDeletion
    ? `${f.number(count)} ${nounWord(count, nounOf(shown))} ${count === 1 ? "waits" : "wait"} for your approval`
    : `${f.number(count)} new ${count === 1 ? "match waits" : "matches wait"} to join Leaving soon`
  const body = isDeletion
    ? `${shown.map((batch) => deletionSentence(batch, f, today)).join(" ")} Nothing is deleted until you approve.`
    : `${shown.map((batch) => `${batch.ruleName} found ${f.number(batch.count)} new ${nounWord(batch.count, batch.level)} last night.`).join(" ")} Nothing changes until you approve.`
  return (
    <Alert
      tone="warning"
      title={title}
      action={
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={cleanup({ tab: "leaving-soon" })} />} data-testid="admin-cleanup-alert-batch-review">
          {isDeletion ? "Review the batch" : "Review the matches"}
        </Button>
      }
      data-testid="admin-cleanup-alert-batch"
    >
      {body}
    </Alert>
  )
}
