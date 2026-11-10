"use client"

import Link from "next/link"
import { useId, useLayoutEffect, useState } from "react"

import { approveCleanupEntryBatch } from "@/actions/admin/cleanup-items"
import { FOOTER_REASONS } from "@/components/admin/cleanup/leaving/batch-footer"
import { MoveToDryRunDialog } from "@/components/admin/cleanup/rules/rule-dialogs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cleanupRule } from "@/lib/admin/routes"
import { plural } from "@/lib/cleanup/action-words"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { EntryBatchData } from "@/lib/cleanup/types/list-parts"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"

export interface EntryBatchCardProps {
  batch: EntryBatchData
  /** Cleanup is off or paused: "Put {N} {items} in Leaving soon..." waits, with its reason. */
  paused: boolean
}

/** "last night" for the schedule, "in the run at {time}" for a run that an admin started (X3). */
function heldWhen(batch: EntryBatchData, f: BoundFormat): string {
  return batch.heldBy.trigger === "admin" ? `in the run at ${f.time(batch.heldBy.at)}` : "last night"
}

/**
 * An entry batch card (UX 4.7.1, `shots/15`): new matches of a rule that
 * the entry check held, so members see nothing yet. "Review the {N}
 * {items}" opens the rule, "Move the rule back to Dry run..." opens the
 * rule dialog, and "Put {N} {items} in Leaving soon..." asks once, then
 * gives them the leave date of the batch. It has no selection table. An
 * entry batch never expires.
 */
export function EntryBatchCard({ batch, paused }: EntryBatchCardProps) {
  const f = useFormat()
  const toast = useToast()
  const reasonId = useId()
  const [dialog, setDialog] = useState<"dryRun" | "put" | null>(null)
  useLayoutEffect(() => () => setDialog(null), [])
  const base = `admin-cleanup-batch-${batch.id}`
  const items = plural(batch.count, batch.level)
  const rule = { id: batch.ruleId, name: batch.ruleName, level: batch.level, mode: batch.mode }

  const put = async () => {
    const result = await approveCleanupEntryBatch({ batchId: batch.id, count: batch.count, keysHash: batch.keysHash, excludeKeys: [],
      reviewedAt: batch.reviewedAt })
    if (!result.success) return { error: result.error }
    toast.showSuccess(`${plural(result.data.joined, "title")} put in Leaving soon.`)
    return {}
  }

  return (
    <Card className="border-warning/45" data-testid={base}>
      <div className="flex flex-col gap-2 px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-h3 text-foreground">
            {batch.count} new {batch.count === 1 ? "match waits" : "matches wait"} to join Leaving soon
          </h2>
          <Badge variant="warning">Held by the entry check</Badge>
        </div>
        <p className="text-ui text-muted-foreground">
          {batch.ruleName} found {batch.count} new {nounWord(batch.count, batch.level)} {heldWhen(batch, f)}. That is more
          than {batch.limit}, so the run added none. Members see nothing yet.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        <Button variant="ghost" size="sm" className="mr-auto" nativeButton={false} render={<Link href={cleanupRule(batch.ruleId)} />}
          data-testid={`${base}-review`}>
          Review the {items}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialog("dryRun")} data-testid={`${base}-dry-run`}>
          Move the rule back to Dry run...
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setDialog("put")}
          {...(paused ? { disabled: true, focusableWhenDisabled: true, "aria-describedby": reasonId } : {})}
          data-testid={`${base}-put`}
        >
          Put {items} in Leaving soon...
        </Button>
        {paused && (
          <span id={reasonId} className="sr-only">
            {FOOTER_REASONS.paused}
          </span>
        )}
      </div>
      <MoveToDryRunDialog rule={rule} leavingCount={batch.leavingCount} open={dialog === "dryRun"} onOpenChange={(open) => setDialog(open ? "dryRun" : null)} />
      <ConfirmDialog
        open={dialog === "put"}
        onOpenChange={(open) => setDialog(open ? "put" : null)}
        title={`Put ${items} in Leaving soon?`}
        description={`The entry check held these new matches of ${batch.ruleName}. They get a leave date of ${f.dayKey(batch.leaveOn, "short")}, and members can see and keep them. Nothing is deleted now.`}
        confirmLabel={`Put ${items} in Leaving soon`}
        pendingLabel="Putting"
        action={put}
        data-testid="admin-cleanup-entry-dialog"
        confirmTestId="admin-cleanup-entry-confirm"
      />
    </Card>
  )
}
