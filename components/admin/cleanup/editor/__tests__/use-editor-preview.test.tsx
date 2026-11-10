/**
 * The editor's one preview query (plan D11, TS 10.7, UX 7.11): the request
 * and its key, the server render for the first key, a typed number that
 * waits 500 ms, the abort of the request before, the delta against the last
 * settled result, the 429, the impact read of a save, and a new load each
 * time the kept route shows the editor again.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, renderHook, waitFor } from "@testing-library/react"
import { Activity, type ReactNode } from "react"

import { isTypedNumber, previewRequest, TYPED_DELAY_MS, useEditorPreview, useTypingNumber, type EditorPreviewOptions } from "@/components/admin/cleanup/editor/use-editor-preview"
import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { DEFAULT_RESULTS_VIEW } from "@/components/admin/cleanup/results/view"
import { CLEANUP_PREVIEW_URL } from "@/hooks/use-cleanup-preview"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { PreviewRequest } from "@/lib/validations/cleanup-actions"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

// Invented rule data.
const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [{ id: "c1", field: "file.size", op: "moreThan", value: { bytes: 20 * 1024 ** 3, unit: "GB" } }],
  protections: [],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}
const withGrace = (graceDays: number): RuleDraft => ({ ...DRAFT, then: { ...DRAFT.then, graceDays } })
const withSize = (gb: number): RuleDraft => ({ ...DRAFT, conditions: [{ ...DRAFT.conditions[0], value: { bytes: gb * 1024 ** 3, unit: "GB" } }] })

const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit]>()
const ok = (data: PreviewResponse) => ({ status: 200, ok: true, headers: { get: () => null }, json: async () => data })
const limited = () => ({ status: 429, ok: false, headers: { get: () => "60" }, json: async () => ({}) })
/** A reply that waits until the request is aborted, and then rejects as fetch does. */
const hang = (init: RequestInit) =>
  new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))
const sentBody = (call: number) => JSON.parse(String(fetchMock.mock.calls[call][1].body)) as PreviewRequest

let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const INITIAL = buildPreview({ matches: 197 })
function options(overrides: Partial<EditorPreviewOptions> = {}): EditorPreviewOptions {
  return {
    scope: "rule-1",
    ruleId: "rule-1",
    draft: DRAFT,
    typing: false,
    view: DEFAULT_RESULTS_VIEW,
    focusId: null,
    initial: { definition: DRAFT, data: INITIAL, updatedAt: Date.now() },
    ...overrides,
  }
}

function renderPreview(start: Partial<EditorPreviewOptions> = {}) {
  return renderHook((props: EditorPreviewOptions) => useEditorPreview(props), { wrapper, initialProps: options(start) })
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})
afterEach(() => {
  jest.useRealTimers()
})

describe("previewRequest", () => {
  it("sends the view, the chip only on Near misses, and the open condition", () => {
    expect(previewRequest(DRAFT, null, DEFAULT_RESULTS_VIEW, null)).toEqual({ definition: DRAFT, tab: "matches", sort: "largest", page: 1 })
    const view = { tab: "nearMisses" as const, sort: "closest" as const, search: "harbor", page: 2, chip: "c1" }
    expect(previewRequest(DRAFT, "rule-1", view, "c1")).toEqual({
      definition: DRAFT, ruleId: "rule-1", tab: "nearMisses", sort: "closest", page: 2, search: "harbor", nearMissCondition: "c1", focus: { conditionId: "c1" },
    })
    expect(previewRequest(DRAFT, null, { ...view, tab: "matches" }, null)).not.toHaveProperty("nearMissCondition")
  })
})

describe("useEditorPreview", () => {
  it("shows the server render for the first key, with no fetch and no delta", async () => {
    const { result } = renderPreview()
    expect(result.current.data).toBe(INITIAL)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.delta).toBeNull()
    expect(result.current.updating).toBe(false)
    expect(client.getQueryCache().getAll()[0].queryKey).toEqual(["cleanup-preview", "rule-1", expect.stringContaining('"file.size"'), "matches|largest|1|||"])
  })

  it("asks at once for a chip change, keyed by the draft and the view, and shows the delta once it settles", async () => {
    fetchMock.mockResolvedValueOnce(ok(buildPreview({ matches: 191 })))
    const { result, rerender } = renderPreview()
    rerender(options({ draft: withSize(30) }))
    expect(result.current.delta).toBeNull()
    await waitFor(() => expect(result.current.data.matches).toBe(191))
    expect(result.current.delta).toBe(-6)
    expect(sentBody(0)).toMatchObject({ ruleId: "rule-1", tab: "matches", definition: withSize(30) })

    // A view change keeps the delta of the same draft
    fetchMock.mockImplementationOnce((_url, init) => hang(init))
    rerender(options({ draft: withSize(30), view: { ...DEFAULT_RESULTS_VIEW, page: 2 } }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.updating).toBe(true)
    expect(result.current.delta).toBe(-6)

    // The next edit hides it until its result settles, and compares with the last settled result
    fetchMock.mockResolvedValueOnce(ok(buildPreview({ matches: 200 })))
    rerender(options({ draft: withSize(10) }))
    expect(result.current.delta).toBeNull()
    await waitFor(() => expect(result.current.data.matches).toBe(200))
    expect(result.current.delta).toBe(9)
    // The newer request aborted the one before it
    expect(fetchMock.mock.calls[1][1].signal?.aborted).toBe(true)
  })

  it("waits 500 ms after a typed number, and sends at once when typing ends", async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementation(async () => ok(buildPreview({ matches: 150 })))
    const { result, rerender } = renderPreview({ typing: true })
    rerender(options({ typing: true, draft: withGrace(4) }))
    rerender(options({ typing: true, draft: withGrace(45) }))
    await act(async () => {
      jest.advanceTimersByTime(TYPED_DELAY_MS - 50)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(60)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBody(0).definition.then.graceDays).toBe(45)

    rerender(options({ typing: true, draft: withGrace(60) }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    rerender(options({ typing: false, draft: withGrace(60) }))
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentBody(1).definition.then.graceDays).toBe(60)
    expect(result.current.rateLimited).toBe(false)
  })

  it("shows the 429 state and keeps the last result", async () => {
    fetchMock.mockResolvedValueOnce(limited())
    const { result, rerender } = renderPreview()
    rerender(options({ draft: withSize(40) }))
    await waitFor(() => expect(result.current.rateLimited).toBe(true))
    expect(result.current.data).toBe(INITIAL)
    expect(result.current.delta).toBeNull()
  })

  it("gives the impact read the settled result of the draft, or asks for it", async () => {
    const { result, rerender } = renderPreview()
    await expect(result.current.current()).resolves.toBe(INITIAL)
    expect(fetchMock).not.toHaveBeenCalled()

    // The request of the new draft is on its way: the read waits for it, and sends no second one
    const fresh = buildPreview({ matches: 12, impact: { leave: 3, join: 0, keep: 5, joinLeaveOn: "2026-12-08", items: [], actionChange: 1 } })
    let answer: (value: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    rerender(options({ draft: withSize(50) }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const read = result.current.current()
    answer(ok(fresh))
    await expect(read).resolves.toEqual(fresh)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A draft with no query yet is asked for
    fetchMock.mockResolvedValueOnce(ok(buildPreview({ matches: 4 })))
    rerender(options({ draft: withSize(60), typing: true }))
    await expect(result.current.current()).resolves.toMatchObject({ matches: 4 })
    expect(sentBody(1).definition).toEqual(withSize(60))
  })

  it("loads again each time the kept route shows the editor again", async () => {
    fetchMock.mockImplementation(async () => ok(buildPreview({ matches: 180 })))
    function Probe({ out }: { out: { matches?: number } }) {
      out.matches = useEditorPreview(options()).data.matches
      return null
    }
    const out: { matches?: number } = {}
    const tree = (mode: "visible" | "hidden") => (
      <QueryClientProvider client={client}>
        <Activity mode={mode}>
          <Probe out={out} />
        </Activity>
      </QueryClientProvider>
    )
    const { rerender } = render(tree("visible"))
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    rerender(tree("hidden"))
    rerender(tree("visible"))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(out.matches).toBe(180))
    expect(fetchMock.mock.calls[0][0]).toBe(CLEANUP_PREVIEW_URL)
  })
})

describe("typed numbers", () => {
  function field(insideEditor: boolean) {
    const host = document.createElement("div")
    if (insideEditor) host.setAttribute("data-testid", "admin-cleanup-condition-editor")
    const input = document.createElement("input")
    input.setAttribute("data-slot", "number-field-input")
    const text = document.createElement("input")
    host.append(input, text)
    document.body.append(host)
    return { input, text, remove: () => host.remove() }
  }

  it("counts a number input outside the condition editor only", () => {
    const outside = field(false)
    const inside = field(true)
    expect(isTypedNumber(outside.input)).toBe(true)
    expect(isTypedNumber(outside.text)).toBe(false)
    expect(isTypedNumber(inside.input)).toBe(false)
    expect(isTypedNumber(null)).toBe(false)
    outside.remove()
    inside.remove()
  })

  it("follows focus in and out of a typed number", () => {
    const { input, text, remove } = field(false)
    const { result, unmount } = renderHook(() => useTypingNumber())
    expect(result.current).toBe(false)
    act(() => input.focus())
    expect(result.current).toBe(true)
    act(() => text.focus())
    expect(result.current).toBe(false)
    unmount()
    remove()
  })
})
