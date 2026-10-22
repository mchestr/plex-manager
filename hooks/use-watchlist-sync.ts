"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { getWatchlistSyncSettings } from "@/actions/watchlist"
import { queryKeys } from "@/hooks/query-keys"

type SettingsResult = Awaited<ReturnType<typeof getWatchlistSyncSettings>>
export type WatchlistSyncSettings = Extract<SettingsResult, { success: true }>["data"]

/**
 * The member's watchlist sync state for the home card (P10.7, UI-41). It
 * starts from the settings the page loaded on the server and never fetches on
 * mount; `refresh()` re-reads it after a toggle or a manual sync. A failed
 * re-read keeps the last settings.
 */
export function useWatchlistSync(initial: WatchlistSyncSettings | null) {
  const queryClient = useQueryClient()
  const { data } = useQuery<WatchlistSyncSettings | null>({
    queryKey: queryKeys.watchlistSync(),
    queryFn: async () => {
      const result = await getWatchlistSyncSettings()
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    initialData: initial,
    // The page's read is current; only a mutation makes it stale
    staleTime: Infinity,
  })

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.watchlistSync() }), [queryClient])

  return { settings: data ?? null, refresh }
}
