/**
 * The batch selection store and its E36 rules (TS 12.6 `leaving/` items 2
 * and 8): write and read, two batch ids, a refused write, the server
 * snapshot, a value that does not parse, the 500 cap, the empty set, prune,
 * the batch change with its read, the own-action rule and a failed read.
 */

import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

import { getCleanupBatchSelection } from "@/actions/admin/cleanup-items"
import { batchRow, deletionBatch, HASH_A, HASH_B, REVIEWED_AT } from "@/components/admin/cleanup/history/__tests__/fixtures"
import type { UntickedRow } from "@/components/admin/cleanup/leaving/selected-summary"
import {
  MAX_UNTICKED,
  pruneBatchSelections,
  readBatchSelection,
  useBatchSelection,
  writeBatchSelection,
} from "@/components/admin/cleanup/leaving/use-batch-selection"
import type { DeletionBatchData } from "@/lib/cleanup/types/list-parts"

jest.mock("@/actions/admin/cleanup-items", () => ({ getCleanupBatchSelection: jest.fn() }))
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: mockShowError }) }))

const KEY = "cleanup:batch-selection:deletion-rule-1"
const ROWS = [batchRow(1), batchRow(2), batchRow(3)]
const BATCH = deletionBatch(ROWS)
const unticked = (n: number, inBatch = true): UntickedRow => ({ itemKey: `movie:tmdb:${n}`, action: "movie.delete", importListExclusion: false,
  sizeBytes: String(1000 + n), inBatch })
const stored = () => JSON.parse(window.sessionStorage.getItem(KEY) ?? "null")

function renderSelection(batch: DeletionBatchData = BATCH) {
  return renderHook(({ value }) => useBatchSelection(value), { initialProps: { value: batch } })
}

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  pruneBatchSelections([])
})

afterEach(() => jest.restoreAllMocks())

describe("the store", () => {
  it("writes an untick in untick order and reads it back, and an empty set removes the value", () => {
    const { result } = renderSelection()
    act(() => void result.current.setTicked([ROWS[1]], false))
    act(() => void result.current.setTicked([ROWS[0]], false))
    expect(stored()).toEqual({ count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: [
      { itemKey: "movie:tmdb:2", action: "movie.delete", importListExclusion: false, sizeBytes: String(98 * 1024 ** 3), inBatch: true },
      { itemKey: "movie:tmdb:1", action: "movie.delete", importListExclusion: false, sizeBytes: String(99 * 1024 ** 3), inBatch: true },
    ] })
    expect(result.current.isTicked("movie:tmdb:1")).toBe(false)
    expect(result.current.isTicked("movie:tmdb:3")).toBe(true)
    expect(result.current.checking).toBe(false)

    act(() => void result.current.setTicked(ROWS, true))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(result.current.unticked).toEqual([])
  })

  it("keeps the selection of each batch apart", () => {
    const other = deletionBatch([batchRow(7)], { id: "deletion-rule-9", ruleId: "rule-9" })
    const first = renderSelection()
    const second = renderSelection(other)
    act(() => void first.result.current.setTicked([ROWS[0]], false))
    expect(second.result.current.unticked).toEqual([])
    act(() => void second.result.current.setTicked([batchRow(7)], false))
    expect(readBatchSelection("deletion-rule-9").value?.unticked.map((row) => row.itemKey)).toEqual(["movie:tmdb:7"])
    expect(first.result.current.unticked.map((row) => row.itemKey)).toEqual(["movie:tmdb:1"])
  })

  it("keeps a write that storage refused in memory, for every reader", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    const { result } = renderSelection()
    const reader = renderSelection()
    act(() => void result.current.setTicked([ROWS[2]], false))
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    expect(reader.result.current.isTicked("movie:tmdb:3")).toBe(false)
  })

  it("reads no stored value on the server, so the buttons wait for the client", () => {
    writeBatchSelection(BATCH.id, { count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: [unticked(1)] })
    function Probe() {
      const selection = useBatchSelection(BATCH)
      return createElement("p", null, `${selection.checking} ${selection.unticked.length}`)
    }
    expect(renderToString(createElement(Probe))).toContain("true 0")
  })

  it("reads a value that does not parse as no value, says so once and removes it", async () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ count: "three", unticked: [] }))
    const { result } = renderSelection()
    expect(result.current.alert).toBe("lost")
    expect(result.current.isTicked("movie:tmdb:1")).toBe(true)
    await waitFor(() => expect(window.sessionStorage.getItem(KEY)).toBeNull())
    expect(result.current.alert).toBe("lost")
    window.sessionStorage.setItem(KEY, "{not json")
    expect(readBatchSelection(BATCH.id)).toEqual({ value: null, invalid: true })
  })

  it("prunes the values of batches that the loader no longer lists", () => {
    writeBatchSelection(BATCH.id, { count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: [unticked(1)] })
    writeBatchSelection("deletion-gone", { count: 1, keysHash: HASH_B, afterOwnAction: null, unticked: [unticked(4)] })
    pruneBatchSelections([BATCH.id])
    expect(readBatchSelection(BATCH.id).value).not.toBeNull()
    expect(readBatchSelection("deletion-gone").value).toBeNull()
  })
})

describe("the 500 cap", () => {
  const many = (count: number, inBatch: boolean, from = 1000) => Array.from({ length: count }, (_, i) => unticked(from + i, inBatch))

  it("changes nothing when 500 keys are in the batch", () => {
    writeBatchSelection(BATCH.id, { count: 3, keysHash: HASH_A, afterOwnAction: null, unticked: many(MAX_UNTICKED, true) })
    const { result } = renderSelection()
    let answer: unknown
    act(() => void (answer = result.current.setTicked([ROWS[0]], false)))
    expect(answer).toEqual({ ok: false, reason: "limit" })
    expect(stored().unticked).toHaveLength(MAX_UNTICKED)
    expect(result.current.isTicked("movie:tmdb:1")).toBe(true)
  })

  it("drops the oldest keys that left the batch, and such a key comes back ticked", () => {
    writeBatchSelection(BATCH.id, { count: 3, keysHash: HASH_A, afterOwnAction: null,
      unticked: [...many(10, false, 5000), ...many(MAX_UNTICKED - 10, true)] })
    const { result } = renderSelection()
    let answer: unknown
    act(() => void (answer = result.current.setTicked([ROWS[0], ROWS[1], ROWS[2]], false)))
    expect(answer).toEqual({ ok: true })
    const keys = stored().unticked.map((row: UntickedRow) => row.itemKey)
    expect(keys).toHaveLength(MAX_UNTICKED)
    expect(keys).not.toContain("movie:tmdb:5000")
    expect(keys).not.toContain("movie:tmdb:5002")
    expect(keys).toContain("movie:tmdb:5003")
    expect(keys.slice(-3)).toEqual(["movie:tmdb:1", "movie:tmdb:2", "movie:tmdb:3"])
    expect(result.current.isTicked("movie:tmdb:5000")).toBe(true)
  })
})

describe("the E36 rules", () => {
  const changed = deletionBatch([ROWS[0], ROWS[2]], { keysHash: HASH_B, reviewedAt: "2026-11-08T12:05:00.000Z" })

  it("keeps the unticked keys at a batch change, reads them again and shows the alert", async () => {
    let resolve: (value: unknown) => void = () => undefined
    jest.mocked(getCleanupBatchSelection).mockImplementation(() => new Promise((done) => (resolve = done as typeof resolve)))
    const { result, rerender } = renderSelection()
    act(() => void result.current.setTicked([ROWS[0], ROWS[1]], false))
    rerender({ value: changed })
    expect(result.current.checking).toBe(true)
    expect(result.current.alert).toBe("changed")
    expect(result.current.changing).toBe(true)
    expect(getCleanupBatchSelection).toHaveBeenCalledWith({ batchId: BATCH.id, keys: ["movie:tmdb:1", "movie:tmdb:2"] })
    await act(async () => resolve({ success: true, data: { count: 2, bytes: "200", keysHash: HASH_B, actionCounts: { "movie.delete": 2 }, exclusionCount: 0,
      unticked: [{ itemKey: "movie:tmdb:1", action: "movie.delete", importListExclusion: false, sizeBytes: "100" }] } }))
    expect(result.current.checking).toBe(false)
    expect(result.current.alert).toBe("changed")
    expect(result.current.totals).toEqual({ count: 2, bytes: "200", actionCounts: { "movie.delete": 2 }, exclusionCount: 0, keysHash: HASH_B })
    expect(result.current.unticked.map((row) => [row.itemKey, row.inBatch])).toEqual([["movie:tmdb:1", true], ["movie:tmdb:2", false]])
    expect(stored()).toMatchObject({ count: 2, keysHash: HASH_B, afterOwnAction: null })
  })

  it("shows no alert at a change without a stored value", () => {
    const { result, rerender } = renderSelection()
    rerender({ value: changed })
    expect(result.current.alert).toBeNull()
    expect(getCleanupBatchSelection).not.toHaveBeenCalled()
  })

  it("shows no alert at the first change after the card's own action, and clears the flag", async () => {
    jest.mocked(getCleanupBatchSelection).mockResolvedValue({ success: true, data: { count: 2, bytes: "200", keysHash: HASH_B,
      actionCounts: { "movie.delete": 2 }, exclusionCount: 0, unticked: [] } })
    const { result, rerender } = renderSelection()
    act(() => void result.current.setTicked([ROWS[1]], false))
    act(() => result.current.ownAction(REVIEWED_AT))
    expect(stored().afterOwnAction).toBe(REVIEWED_AT)
    rerender({ value: changed })
    expect(result.current.alert).toBeNull()
    await waitFor(() => expect(stored()?.afterOwnAction ?? null).toBeNull())
    expect(result.current.alert).toBeNull()
    expect(result.current.isTicked("movie:tmdb:2")).toBe(false)
  })

  it("clears the own-action flag on a new render with the same numbers", async () => {
    const { result, rerender } = renderSelection()
    act(() => void result.current.setTicked([ROWS[1]], false))
    act(() => result.current.ownAction(REVIEWED_AT))
    rerender({ value: { ...BATCH, reviewedAt: "2026-11-08T12:01:00.000Z" } })
    await waitFor(() => expect(stored().afterOwnAction).toBeNull())
    expect(getCleanupBatchSelection).not.toHaveBeenCalled()
  })

  it("shows the error toast after a failed read, keeps the alert and lets the buttons act", async () => {
    jest.mocked(getCleanupBatchSelection).mockResolvedValue({ success: false, code: "RATE_LIMITED", error: "Too many tries. Wait a minute." })
    const { result, rerender } = renderSelection()
    act(() => void result.current.setTicked([ROWS[1]], false))
    rerender({ value: changed })
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Too many tries. Wait a minute."))
    expect(result.current.checking).toBe(false)
    expect(result.current.alert).toBe("changed")
    expect(stored().keysHash).toBe(HASH_A)
  })

  it("reads again after a stale answer with the same numbers, and shows the alert", async () => {
    jest.mocked(getCleanupBatchSelection).mockRejectedValue(new Error("offline"))
    const { result } = renderSelection()
    act(() => result.current.stale())
    expect(result.current.alert).toBe("changed")
    expect(getCleanupBatchSelection).not.toHaveBeenCalled()
    act(() => void result.current.setTicked([ROWS[1]], false))
    act(() => result.current.stale())
    expect(result.current.checking).toBe(true)
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("That didn't work. Try again."))
    expect(result.current.checking).toBe(false)
  })
})
