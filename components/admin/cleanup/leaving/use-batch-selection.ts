"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { z } from "zod"

import { getCleanupBatchSelection } from "@/actions/admin/cleanup-items"
import type { BatchTotals, UntickedRow } from "@/components/admin/cleanup/leaving/selected-summary"
import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { useIsClient } from "@/hooks/use-is-client"
import type { BatchRow, DeletionBatchData } from "@/lib/cleanup/types/list-parts"
import type { CleanupBatchSelection } from "@/lib/cleanup/types/screens"
import { ACTION_IDS } from "@/lib/validations/cleanup-vocabulary"

/**
 * The selection of a deletion batch card (TS 12.6 `leaving/` items 2 and 8,
 * E36): a set of unticked rows in `sessionStorage`, so it outlives a tab
 * switch, a link to another tab and a reload, but not a new browser tab.
 * It follows `components/rewind/stage/use-story-cut.ts`: one store per
 * batch id under `cleanup:batch-selection:<batchId>`, read with
 * `useSyncExternalStore` (the server snapshot holds no value), an
 * in-memory map for a write that storage refused, and a module listener set.
 *
 * The stored value is `{ count, keysHash, afterOwnAction, unticked }`:
 * the loader's numbers that the set last matched, the `reviewedAt` of the
 * render on which the card's own action started (or null), and the unticked
 * rows in untick order. It holds no title and no member data.
 *
 * @module components/admin/cleanup/leaving/use-batch-selection
 */

/** The most unticked titles that a batch keeps (`excludeKeysSchema`). @internal */
export const MAX_UNTICKED = 500
const PREFIX = "cleanup:batch-selection:"
const storageKey = (batchId: string) => `${PREFIX}${batchId}`

const storedSchema = z.object({
  count: z.number().int().min(0),
  keysHash: z.string().max(64),
  afterOwnAction: z.string().max(40).nullable(),
  unticked: z
    .array(z.object({ itemKey: z.string().max(80), action: z.enum(ACTION_IDS), importListExclusion: z.boolean(), sizeBytes: z.string().regex(/^\d+$/),
      inBatch: z.boolean() }))
    .max(MAX_UNTICKED),
})

/** The stored selection of one batch. */
type StoredSelection = z.infer<typeof storedSchema>

/** What the store holds for a batch: a value, or none; `invalid` while a value does not parse. */
interface SelectionSnapshot {
  value: StoredSelection | null
  invalid: boolean
}

const NONE: SelectionSnapshot = { value: null, invalid: false }
const listeners = new Set<() => void>()
/** What this tab chose when storage refused the write, by batch id. Null: removed. */
const unsaved = new Map<string, string | null>()
/** The parsed value of each batch, cached by its raw string. */
const cache = new Map<string, { raw: string; snapshot: SelectionSnapshot }>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const notify = () => listeners.forEach((listener) => listener())

function readRaw(batchId: string): string | null {
  if (unsaved.has(batchId)) return unsaved.get(batchId) ?? null
  try {
    return window.sessionStorage.getItem(storageKey(batchId))
  } catch {
    return null
  }
}

function parse(raw: string): SelectionSnapshot {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { value: null, invalid: true }
  }
  const parsed = storedSchema.safeParse(json)
  return parsed.success ? { value: parsed.data, invalid: false } : { value: null, invalid: true }
}

/** The stored selection of a batch. The same object while its raw string does not change. @internal */
export function readBatchSelection(batchId: string): SelectionSnapshot {
  const raw = readRaw(batchId)
  if (raw === null) return NONE
  const hit = cache.get(batchId)
  if (hit?.raw === raw) return hit.snapshot
  const snapshot = parse(raw)
  cache.set(batchId, { raw, snapshot })
  return snapshot
}

/** Writes or removes the selection of a batch. A value whose set is empty is removed. @internal */
export function writeBatchSelection(batchId: string, value: StoredSelection | null): void {
  const raw = value && value.unticked.length > 0 ? JSON.stringify(value) : null
  try {
    if (raw === null) window.sessionStorage.removeItem(storageKey(batchId))
    else window.sessionStorage.setItem(storageKey(batchId), raw)
    unsaved.delete(batchId)
  } catch {
    unsaved.set(batchId, raw)
  }
  notify()
}

/** Removes the selections of the deletion batches that the loader no longer lists (TS 12.6 `leaving/` item 2.9). */
export function pruneBatchSelections(batchIds: readonly string[]): void {
  const keep = new Set(batchIds)
  let removed = false
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, i) => window.sessionStorage.key(i))
    for (const key of keys) {
      if (key?.startsWith(PREFIX) && !keep.has(key.slice(PREFIX.length))) {
        window.sessionStorage.removeItem(key)
        removed = true
      }
    }
  } catch {
    // Storage that refuses reads holds nothing to prune
  }
  for (const batchId of [...unsaved.keys()]) {
    if (keep.has(batchId)) continue
    unsaved.delete(batchId)
    removed = true
  }
  if (removed) notify()
}

/** An untick changes nothing at the limit (TS 12.6 `leaving/` item 2.5). */
type UntickResult = { ok: true } | { ok: false; reason: "limit" }

/** "changed": the numbers changed. "lost": a stored selection did not parse. */
type SelectionAlert = "changed" | "lost" | null

export interface BatchSelection {
  /** Before the client read the store, and while a read of the batch runs: the three footer buttons wait. */
  checking: boolean
  /** Every stored unticked row in untick order, also rows that left the batch. */
  unticked: readonly UntickedRow[]
  /** The batch numbers: the newest read of `getCleanupBatchSelection` for the loader's numbers, else the loader's. */
  totals: BatchTotals & { keysHash: string }
  alert: SelectionAlert
  /** A batch change detected now, with an alert: the card closes an open batch dialog. */
  changing: boolean
  isTicked: (itemKey: string) => boolean
  /** Ticks or unticks rows. An untick that would hold more than 500 titles of the batch changes nothing. */
  setTicked: (rows: readonly BatchRow[], ticked: boolean) => UntickResult
  /** After an action of the card that changed rows: the next batch change shows no alert. `startedAt`: the `reviewedAt` it started on. */
  ownAction: (startedAt: string) => void
  /** A batch dialog met changed numbers: the alert shows, and the card reads its unticked rows again. */
  stale: () => void
}

interface ReadJob {
  batchId: string
  key: string
  count: number
  keysHash: string
  silent: boolean
}

class ReadFailed extends Error {}

const numbersOf = (value: { count: number; keysHash: string }) => `${value.count}|${value.keysHash}`
const untickedOf = (row: BatchRow): UntickedRow => ({ itemKey: row.itemKey, action: row.action, importListExclusion: row.importListExclusion,
  sizeBytes: row.sizeBytes !== null && /^\d+$/.test(row.sizeBytes) ? row.sizeBytes : "0", inBatch: true })

/**
 * The E36 rules of a deletion batch card. A row that the admin unticked
 * never becomes ticked without an admin action. A loader `count` or
 * `keysHash` that differs from the stored ones is a batch change: the set
 * stays, the alert shows (unless the card's own action caused it), and the
 * card reads every stored key again with `getCleanupBatchSelection`. A key
 * that the read leaves out stays with `inBatch: false`. The set holds at
 * most 500 keys: an untick drops the oldest keys that left the batch, and
 * changes nothing if that is not enough.
 */
export function useBatchSelection(batch: DeletionBatchData): BatchSelection {
  const toast = useToast()
  const isClient = useIsClient()
  const snapshot = useSyncExternalStore(subscribe, () => readBatchSelection(batch.id), () => NONE)
  const stored = snapshot.value
  const loaderKey = numbersOf(batch)
  const storedKey = stored ? numbersOf(stored) : null
  const own = stored?.afterOwnAction ?? null
  const [read, setRead] = useState<{ key: string; result: CleanupBatchSelection } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [reading, setReading] = useState(0)
  const [alert, setAlert] = useState<SelectionAlert>(null)
  const inFlight = useRef<string | null>(null)
  if (snapshot.invalid && alert !== "lost") setAlert("lost")

  const runRead = useCallback(
    async (job: ReadJob) => {
      const keys = readBatchSelection(job.batchId).value?.unticked.map((row) => row.itemKey) ?? []
      if (keys.length === 0) return
      try {
        const result = await getCleanupBatchSelection({ batchId: job.batchId, keys })
        if (!result.success) throw new ReadFailed(result.error)
        const now = readBatchSelection(job.batchId).value
        const found = new Map(result.data.unticked.map((row) => [row.itemKey, row]))
        const sent = new Set(keys)
        const next = (now?.unticked ?? []).map((row): UntickedRow => {
          const hit = found.get(row.itemKey)
          if (hit) return { ...hit, inBatch: true }
          return sent.has(row.itemKey) ? { ...row, inBatch: false } : row
        })
        const silent = job.silent || (now?.afterOwnAction ?? null) !== null
        writeBatchSelection(job.batchId, { count: job.count, keysHash: job.keysHash, afterOwnAction: null, unticked: next })
        setRead({ key: job.key, result: result.data })
        if (!silent) setAlert("changed")
      } catch (error) {
        toast.showError(error instanceof ReadFailed ? error.message : CONFIRM_FALLBACK_ERROR)
        setFailedKey(job.key)
        if (!job.silent) setAlert("changed")
      }
    },
    [toast]
  )

  useEffect(() => {
    if (snapshot.invalid) writeBatchSelection(batch.id, null)
  }, [snapshot.invalid, batch.id])

  // The batch change and the end of the own-action rule (TS 12.6 `leaving/` items 2.3 and 2.4)
  useEffect(() => {
    if (!stored) return
    const job = { batchId: batch.id, key: loaderKey, count: batch.count, keysHash: batch.keysHash }
    if (own !== null && own === batch.reviewedAt) return
    if (own !== null && storedKey === loaderKey) {
      writeBatchSelection(batch.id, { ...stored, afterOwnAction: null })
      return
    }
    if (storedKey === loaderKey || failedKey === loaderKey || inFlight.current === loaderKey) return
    inFlight.current = loaderKey
    void runRead({ ...job, silent: own !== null }).finally(() => {
      inFlight.current = null
    })
  }, [stored, own, storedKey, loaderKey, failedKey, batch.id, batch.count, batch.keysHash, batch.reviewedAt, runRead])

  const changed = stored !== null && storedKey !== loaderKey && failedKey !== loaderKey
  const keys = new Set(stored?.unticked.map((row) => row.itemKey))
  const totals = read !== null && read.key === loaderKey ? read.result : batch

  const setTicked = (rows: readonly BatchRow[], ticked: boolean): UntickResult => {
    const current = readBatchSelection(batch.id).value
    const list = current?.unticked ?? []
    if (ticked) {
      const drop = new Set(rows.map((row) => row.itemKey))
      const next = list.filter((row) => !drop.has(row.itemKey))
      if (current && next.length !== list.length) writeBatchSelection(batch.id, { ...current, unticked: next })
      return { ok: true }
    }
    const have = new Set(list.map((row) => row.itemKey))
    const added = rows.filter((row) => !have.has(row.itemKey)).map(untickedOf)
    if (added.length === 0) return { ok: true }
    if (list.filter((row) => row.inBatch).length + added.length > MAX_UNTICKED) return { ok: false, reason: "limit" }
    let over = list.length + added.length - MAX_UNTICKED
    const kept = list.filter((row) => {
      if (over <= 0 || row.inBatch) return true
      over -= 1
      return false
    })
    const base = current ?? { count: batch.count, keysHash: batch.keysHash, afterOwnAction: null }
    writeBatchSelection(batch.id, { ...base, unticked: [...kept, ...added] })
    return { ok: true }
  }

  const ownAction = (startedAt: string) => {
    const current = readBatchSelection(batch.id).value
    if (current) writeBatchSelection(batch.id, { ...current, afterOwnAction: startedAt })
  }

  const stale = () => {
    setAlert("changed")
    if (!readBatchSelection(batch.id).value) return
    setReading((n) => n + 1)
    void runRead({ batchId: batch.id, key: loaderKey, count: batch.count, keysHash: batch.keysHash, silent: false }).finally(() =>
      setReading((n) => n - 1)
    )
  }

  return {
    checking: !isClient || reading > 0 || changed,
    unticked: stored?.unticked ?? [],
    totals: { count: totals.count, bytes: totals.bytes, actionCounts: totals.actionCounts, exclusionCount: totals.exclusionCount, keysHash: totals.keysHash },
    alert: alert ?? (changed && own === null ? "changed" : null),
    changing: changed && own === null,
    isTicked: (itemKey) => !keys.has(itemKey),
    setTicked,
    ownAction,
    stale,
  }
}
