import { act, renderHook } from "@testing-library/react"

import { useLiveRefresh } from "@/hooks/use-live-refresh"

const mockRefresh = jest.fn()
const mockRouter = { refresh: mockRefresh }
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }))

let visibility: DocumentVisibilityState = "visible"

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"))
  })
}

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility })
})

beforeEach(() => {
  jest.useFakeTimers()
  mockRefresh.mockClear()
  visibility = "visible"
})

afterEach(() => {
  jest.useRealTimers()
})

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms))

describe("useLiveRefresh", () => {
  it("refreshes every 10 s while the tab is visible", () => {
    renderHook(() => useLiveRefresh({ intervalMs: 10_000 }))
    advance(9_999)
    expect(mockRefresh).not.toHaveBeenCalled()
    advance(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    advance(20_000)
    expect(mockRefresh).toHaveBeenCalledTimes(3)
  })

  it("does not refresh while hidden, and refreshes once on return", () => {
    renderHook(() => useLiveRefresh({ intervalMs: 10_000 }))
    setVisibility("hidden")
    advance(60_000)
    expect(mockRefresh).not.toHaveBeenCalled()

    setVisibility("visible")
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    advance(10_000)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
  })

  it("does not start in a hidden tab", () => {
    visibility = "hidden"
    renderHook(() => useLiveRefresh())
    advance(30_000)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("stops while paused and starts again after", () => {
    const { rerender } = renderHook(({ paused }) => useLiveRefresh({ intervalMs: 10_000, paused }), {
      initialProps: { paused: true },
    })
    advance(30_000)
    setVisibility("visible")
    expect(mockRefresh).not.toHaveBeenCalled()

    rerender({ paused: false })
    advance(10_000)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() => useLiveRefresh({ intervalMs: 10_000 }))
    unmount()
    advance(30_000)
    setVisibility("visible")
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
