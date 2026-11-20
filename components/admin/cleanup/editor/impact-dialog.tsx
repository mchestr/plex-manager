"use client"

import { Minus, Plus } from "lucide-react"
import { type ReactNode, useId, useState } from "react"

import { itemName } from "@/components/admin/cleanup/results/view"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { impactActionLine, plural } from "@/lib/cleanup/action-words"
import type { ImpactChange, ImpactItem, PreviewImpact } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { ActionId, Level, Mode } from "@/lib/validations/cleanup-vocabulary"

const MODE_NAMES: Record<Mode, string> = { dryRun: "Dry run", reviewFirst: "Review first", automatic: "Automatic" }

/** The list groups, in their order (UX 7.7 item 3.2.5, ux-a11y-r5-6). */
const GROUPS: readonly { change: ImpactChange; title: string }[] = [
  { change: "actionChange", title: "Get the new action" },
  { change: "leave", title: "Leave" },
  { change: "join", title: "Join" },
]

/** The titles that a live save moves: the sum of the three counts (ux-a11y-r4-5). */
export const impactCount = (impact: Pick<PreviewImpact, "leave" | "join" | "actionChange">): number => impact.leave + impact.join + impact.actionChange

const countOf = (impact: PreviewImpact, change: ImpactChange): number => (change === "leave" ? impact.leave : change === "join" ? impact.join : impact.actionChange)
const bytesOf = (item: ImpactItem) => (item.sizeBytes === null ? -1 : Number(item.sizeBytes))

export interface ImpactDialogProps {
  open: boolean
  /** False: "Keep editing", Esc or Close. The save does not run. */
  onOpenChange: (open: boolean) => void
  ruleName: string
  mode: Mode
  level: Level
  impact: PreviewImpact
  /** The Then of the draft: the new action and its import list exclusion. */
  action: ActionId
  importListExclusion: boolean
  saving: boolean
  /** A save that failed with no error summary to show: it stays in the dialog (UX 7.12). */
  error?: string | null
  /** "Save changes": the save with `confirmImpact: true`. */
  onSave: () => void
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span>{children}</span>
    </li>
  )
}

/** The grouped titles of "Show the {N} {items}": each group largest first, cut groups end with "and {N} more". */
function ImpactList({ impact, id }: { impact: PreviewImpact; id: string }) {
  return (
    <div id={id} className="flex flex-col gap-4" data-testid="admin-cleanup-impact-list">
      {GROUPS.map(({ change, title }) => {
        const count = countOf(impact, change)
        if (count === 0) return null
        const items = impact.items.filter((item) => item.change === change).sort((a, b) => bytesOf(b) - bytesOf(a))
        const more = count - items.length
        return (
          <section key={change} className="flex flex-col gap-1.5" aria-label={title} data-testid={`admin-cleanup-impact-group-${change}`}>
            <h3 className="text-ui font-semibold text-foreground">{title}</h3>
            <ul className="flex flex-col divide-y rounded-md border text-ui">
              {items.map((item) => (
                <li key={item.itemKey} className="flex items-baseline justify-between gap-3 px-2.5 py-1.5">
                  <span className="min-w-0 text-foreground">{itemName(item)}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{sizeText(item.sizeBytes)}</span>
                </li>
              ))}
            </ul>
            {more > 0 && <p className="text-label text-muted-foreground">and {more} more</p>}
          </section>
        )
      })}
    </div>
  )
}

/**
 * The impact of a live save (UX 7.7 item 3.2, UX 8.6 "Impact on save"):
 * "Save changes to {rule}?" with the titles that leave Leaving soon, the
 * titles that join at the next run, the ones that keep their date, and the
 * titles in Leaving soon whose action gets less careful. "Show the {N}
 * {items}" lists them in three groups. "Save changes" sends the save with
 * `confirmImpact`. "Keep editing" closes it, and the editor stays as it was.
 */
export function ImpactDialog({ open, onOpenChange, ruleName, mode, level, impact, action, importListExclusion, saving, error, onSave }: ImpactDialogProps) {
  const f = useFormat()
  const listId = useId()
  const [shown, setShown] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setShown(false)
  }
  const total = impactCount(impact)
  const one = (count: number) => count === 1

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent data-testid="admin-cleanup-impact-dialog">
        <DialogHeader>
          <DialogTitle>Save changes to {ruleName}?</DialogTitle>
          <DialogDescription>
            This rule is in {MODE_NAMES[mode]}. Titles that no longer match leave Leaving soon now. New matches join at the next run, through the entry check.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-ui text-foreground">
          {impact.leave > 0 && (
            <Line icon={<Icon icon={Minus} />}>
              {plural(impact.leave, level)} {one(impact.leave) ? "leaves Leaving soon: it no longer matches." : "leave Leaving soon: they no longer match."}
            </Line>
          )}
          {impact.join > 0 && (
            <Line icon={<Icon icon={Plus} />}>
              {plural(impact.join, level)} {one(impact.join) ? "joins" : "join"} at the next run, with a leave date of {f.dayKey(impact.joinLeaveOn)}.
            </Line>
          )}
          {impact.keep > 0 && (
            <Line icon={<Icon icon={icons.scheduled} />}>
              The other {f.number(impact.keep)} {one(impact.keep) ? "keeps its" : "keep their"} leave date.
            </Line>
          )}
          {impact.actionChange > 0 && (
            <Line icon={<Icon icon={icons.warning} />}>
              <span data-testid="admin-cleanup-impact-action">
                {impactActionLine(action, { exclusion: importListExclusion, count: impact.actionChange, level })}
              </span>
            </Line>
          )}
        </ul>
        <div className="flex flex-col gap-3">
          <Button
            variant="link"
            size="sm"
            className="h-auto self-start px-0"
            aria-expanded={shown}
            aria-controls={shown ? listId : undefined}
            onClick={() => setShown((s) => !s)}
            data-testid="admin-cleanup-impact-toggle"
          >
            Show the {plural(total, level)}
          </Button>
          {shown && <ImpactList impact={impact} id={listId} />}
        </div>
        {error && <Alert tone="destructive">{error}</Alert>}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={saving} data-testid="admin-cleanup-impact-keep-editing" />}>Keep editing</DialogClose>
          <Button loading={saving} loadingLabel="Saving" onClick={onSave} data-testid="admin-cleanup-impact-save">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
