"use client"

import { useState } from "react"

import { ExcludeDialog } from "@/components/admin/cleanup/leaving/exclude-dialog"
import { PostponeDialog } from "@/components/admin/cleanup/leaving/postpone-dialog"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { ExcludeCleanupItemsResult, PostponeCleanupItemsResult } from "@/lib/cleanup/types/actions"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import { icons } from "@/lib/ui/icons"

/**
 * Where the Why Sheet opened (UX 4.5): `preview` (Results, the largest
 * matches, the turn-on table) offers Exclude, `leaving` (the Leaving soon
 * list and the batch cards) also Postpone, and `history` is read only.
 */
export type WhySurface = "preview" | "leaving" | "history"

/** The result of a Postpone or an Exclude from the Sheet. */
export type WhyActionResult = PostponeCleanupItemsResult | ExcludeCleanupItemsResult

export interface WhyFooterProps {
  data: WhySheetData | undefined
  surface: WhySurface
  /** Closes the Sheet: Close, and after a successful Postpone or Exclude. */
  onClose: () => void
  /** Told after a successful Postpone or Exclude, before the Sheet closes (TS 12.6 `leaving/` item 2.3.2). */
  onActionDone?: (result: WhyActionResult) => void
}

/** The title as the dialogs name it: "Supernatural, Season 4" for a season. */
export function itemLabel(item: WhySheetData["item"]): string {
  return item.level === "season" && item.seasonNumber !== null ? `${item.title}, Season ${item.seasonNumber}` : item.title
}

/**
 * The footer of the Why Sheet (UX 4.5, 8.5): "Exclude this {item}..." with
 * its dialog, "Postpone..." for a title in Leaving soon on the Leaving soon
 * surfaces, and Close. History and a deleted title are read only. After a
 * successful Postpone or Exclude it calls `onActionDone(result)` and closes
 * the Sheet; the owner of the opener then moves focus (UX 7.9).
 */
export function WhyFooter({ data, surface, onClose, onActionDone }: WhyFooterProps) {
  const [dialog, setDialog] = useState<"exclude" | "postpone" | null>(null)
  const readOnly = surface === "history" || !data || data.state === "deleted" || data.fromRun !== undefined
  const leaving = surface === "leaving" && data?.leaving ? data.leaving : null

  const done = (result: WhyActionResult) => {
    setDialog(null)
    onActionDone?.(result)
    onClose()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {!readOnly && data && (
        <>
          <Button
            variant="outline"
            icon={<Icon icon={icons.exclude} />}
            onClick={() => setDialog("exclude")}
            data-testid="admin-cleanup-why-exclude"
          >
            Exclude this {NOUNS[data.item.level][0]}...
          </Button>
          {leaving && (
            <Button variant="outline" onClick={() => setDialog("postpone")} data-testid="admin-cleanup-why-postpone">
              Postpone...
            </Button>
          )}
          <ExcludeDialog
            target={{ itemKeys: [data.item.itemKey], title: itemLabel(data.item), level: data.item.level }}
            open={dialog === "exclude"}
            onOpenChange={(open) => setDialog(open ? "exclude" : null)}
            onDone={done}
          />
          {leaving && (
            <PostponeDialog
              target={{ itemKeys: [data.item.itemKey], leaveOns: [leaving.leaveOn], seasons: data.item.level === "season" }}
              open={dialog === "postpone"}
              onOpenChange={(open) => setDialog(open ? "postpone" : null)}
              onDone={done}
            />
          )}
        </>
      )}
      <Button variant="ghost" className="ml-auto" onClick={onClose} data-testid="admin-cleanup-why-close">
        Close
      </Button>
    </div>
  )
}
