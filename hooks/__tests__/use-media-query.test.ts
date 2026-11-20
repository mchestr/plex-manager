import { act, renderHook } from "@testing-library/react"
import { createElement } from "react"
import { renderToString } from "react-dom/server"

import { useMediaQuery } from "@/hooks/use-media-query"

/** A MediaQueryList whose `matches` the test sets, firing `change` like a browser. */
function fakeMediaQueryList(query: string, initial: boolean) {
  const listeners = new Set<() => void>()
  const list = {
    matches: initial,
    media: query,
    addEventListener: jest.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: jest.fn((_type: string, listener: () => void) => listeners.delete(listener)),
  }
  const set = (matches: boolean) => {
    list.matches = matches
    listeners.forEach((listener) => listener())
  }
  return { list, set, listeners }
}

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function mockMatchMedia(initial: boolean) {
  const fakes = new Map<string, ReturnType<typeof fakeMediaQueryList>>()
  window.matchMedia = jest.fn((query: string) => {
    if (!fakes.has(query)) fakes.set(query, fakeMediaQueryList(query, initial))
    return fakes.get(query)!.list as unknown as MediaQueryList
  })
  return (query: string) => fakes.get(query)!
}

function Probe({ query }: { query: string }) {
  return createElement("span", null, useMediaQuery(query) ? "match" : "no match")
}

describe("useMediaQuery", () => {
  it("reads false on the server, whatever the browser would say", () => {
    mockMatchMedia(true)
    expect(renderToString(createElement(Probe, { query: "(min-width: 48rem)" }))).toBe("<span>no match</span>")
  })

  it("reads the browser value on the client", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery("(min-width: 48rem)"))
    expect(result.current).toBe(true)
  })

  it("follows a change event, and stops listening on unmount", () => {
    const fake = mockMatchMedia(false)
    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 48rem)"))
    expect(result.current).toBe(false)

    act(() => fake("(min-width: 48rem)").set(true))
    expect(result.current).toBe(true)
    act(() => fake("(min-width: 48rem)").set(false))
    expect(result.current).toBe(false)

    unmount()
    expect(fake("(min-width: 48rem)").listeners.size).toBe(0)
    expect(fake("(min-width: 48rem)").list.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function))
  })

  it("subscribes again when the query changes", () => {
    const fake = mockMatchMedia(false)
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: "(min-width: 48rem)" },
    })
    rerender({ query: "(min-width: 64rem)" })
    expect(fake("(min-width: 48rem)").listeners.size).toBe(0)
    expect(fake("(min-width: 64rem)").listeners.size).toBe(1)

    act(() => fake("(min-width: 64rem)").set(true))
    expect(result.current).toBe(true)
  })
})
