"use client"

import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"

import { DeletionBatchCard } from "@/components/admin/cleanup/leaving/deletion-batch-card"
import { EntryBatchCard } from "@/components/admin/cleanup/leaving/entry-batch-card"
import { ExitsLine } from "@/components/admin/cleanup/leaving/exits-line"
import { LeavingTable } from "@/components/admin/cleanup/leaving/leaving-table"
import { pruneBatchSelections } from "@/components/admin/cleanup/leaving/use-batch-selection"
import type { CleanupLeavingData } from "@/lib/cleanup/types/screens"

/** Where focus goes after an action of the tab (UX 7.9). */
export interface LeavingFocus {
  /** "Everything in Leaving soon" (`tabIndex={-1}`): the target once a card or a row is gone. */
  listHeading: RefObject<HTMLElement | null>
  /** If the focused element leaves the page with the next data, focus moves to `fallback()`. */
  afterRemoval: (fallback: () => HTMLElement | null) => void
}

const HEADING_ID = "admin-cleanup-leaving-heading"

/**
 * The Leaving soon tab of Media cleanup (UX 4.7, `shots/07`): the batch
 * cards first, newest due first, then the list heading, the exits of the
 * last 7 days and the grouped list. While cleanup is off or paused, every
 * status reads Paused and the approve buttons wait with the reason. It
 * removes the stored selections of deletion batches that the loader no
 * longer lists (the loader lists every batch, whatever the filters).
 */
export function LeavingTab({ data }: { data: CleanupLeavingData }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const pending = useRef<(() => HTMLElement | null) | null>(null)
  const paused = !data.feature.enabled || data.feature.pausedAt !== null
  const deletionIds = data.batches.flatMap((batch) => (batch.kind === "deletion" ? [batch.id] : []))
  const deletionKey = deletionIds.join(",")

  useEffect(() => {
    pruneBatchSelections(deletionKey === "" ? [] : deletionKey.split(","))
  }, [deletionKey])

  // A card or a row that held focus left with the new data: focus goes to its fallback (UX 7.9)
  useLayoutEffect(() => {
    const fallback = pending.current
    if (!fallback) return
    pending.current = null
    const active = document.activeElement
    if (active === null || active === document.body) fallback()?.focus()
  }, [data])

  const afterRemoval = useCallback((fallback: () => HTMLElement | null) => {
    pending.current = fallback
  }, [])
  const focus = useMemo<LeavingFocus>(() => ({ listHeading: heading, afterRemoval }), [afterRemoval])

  return (
    <div className="flex flex-col gap-8" data-testid="admin-cleanup-leaving-tab">
      {data.batches.length > 0 && (
        <div className="flex flex-col gap-4">
          {data.batches.map((batch) =>
            batch.kind === "deletion" ? (
              <DeletionBatchCard key={batch.id} batch={batch} budget={data.budget} paused={paused} focus={focus} />
            ) : (
              <EntryBatchCard key={batch.id} batch={batch} paused={paused} />
            )
          )}
        </div>
      )}
      <section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 ref={heading} id={HEADING_ID} tabIndex={-1} className="text-h2 text-foreground outline-none">
            Everything in Leaving soon
          </h2>
          <p className="text-ui text-muted-foreground">Grouped by leave date. A play, a Keep or a new protection takes a title out at the next check.</p>
        </div>
        <ExitsLine exits={data.exits7d} />
        <LeavingTable data={data} focus={focus} />
      </section>
    </div>
  )
}
