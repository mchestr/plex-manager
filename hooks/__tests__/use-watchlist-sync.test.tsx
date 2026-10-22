/**
 * The home card's watchlist query (P10.7): it starts from the page's settings
 * with no request, and `refresh()` (called after a mutation) re-reads them
 * under the shared key.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { getWatchlistSyncSettings } from "@/actions/watchlist"
import { queryKeys } from "@/hooks/query-keys"
import { useWatchlistSync, type WatchlistSyncSettings } from "@/hooks/use-watchlist-sync"

jest.mock("@/actions/watchlist", () => ({ getWatchlistSyncSettings: jest.fn() }))

const mockGet = jest.mocked(getWatchlistSyncSettings)

function settings(syncEnabled: boolean): WatchlistSyncSettings {
  return {
    hasPlexToken: true,
    hasOverseerr: true,
    globalSyncEnabled: true,
    settings: {
      syncEnabled,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      itemsSynced: 0,
      itemsRequested: 0,
      totalItemsSynced: 0,
      totalItemsRequested: 0,
    },
    recentHistory: [],
  }
}

function setup(initial: WatchlistSyncSettings | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useWatchlistSync(initial), { wrapper }) }
}

beforeEach(() => jest.clearAllMocks())

describe("useWatchlistSync", () => {
  it("uses the page's settings as initial data and asks for nothing on mount", () => {
    const { result } = setup(settings(true))

    expect(result.current.settings?.settings?.syncEnabled).toBe(true)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it("re-reads the settings when a mutation invalidates the key", async () => {
    mockGet.mockResolvedValue({ success: true, data: settings(false) })
    const { client, result } = setup(settings(true))

    await act(() => client.invalidateQueries({ queryKey: queryKeys.watchlistSync() }))

    await waitFor(() => expect(result.current.settings?.settings?.syncEnabled).toBe(false))
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it("keeps the last settings when the re-read fails", async () => {
    mockGet.mockResolvedValue({ success: false, code: "INTERNAL", error: "Failed to fetch settings" })
    const { result } = setup(settings(true))

    await act(() => result.current.refresh())

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(result.current.settings?.settings?.syncEnabled).toBe(true)
  })
})
