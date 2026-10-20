/**
 * A `next/navigation` stand-in whose URL lives in memory: `router.replace`
 * moves it and every `useSearchParams` caller re-renders, so URL-driven
 * components can be tested end to end.
 *
 * ```ts
 * jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
 * beforeEach(() => resetUrl("/admin/users?role=admin"))
 * ```
 */
import { useSyncExternalStore } from "react"

let url = new URL("http://test/")
const listeners = new Set<() => void>()
let cached = { search: "", params: new URLSearchParams() }

export const replaceMock = jest.fn((href: string) => {
  url = new URL(href, url)
  listeners.forEach((listener) => listener())
})

export function resetUrl(href = "/") {
  url = new URL(href, "http://test/")
  replaceMock.mockClear()
  listeners.forEach((listener) => listener())
}

/** The current path and query, such as "/admin/users?sort=-name". */
export function currentHref() {
  return `${url.pathname}${url.search}`
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const navigationModule = {
  useRouter: () => ({ replace: replaceMock, push: replaceMock, refresh: jest.fn() }),
  usePathname: () => useSyncExternalStore(subscribe, () => url.pathname),
  // Like Next's, the object stays the same until the query changes.
  useSearchParams: () => {
    const search = useSyncExternalStore(subscribe, () => url.search)
    if (cached.search !== search) cached = { search, params: new URLSearchParams(search) }
    return cached.params
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}
