"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { queryKeys } from "@/hooks/query-keys"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import {
  ADMIN_SEARCH_MAX,
  adminSearchResponseSchema,
  adminSearchUrl,
  type AdminSearchKind,
  type AdminSearchResult,
} from "@/lib/admin/search"

/** How long typing must pause before a search goes out. */
const DEBOUNCE_MS = 180

async function fetchAdminSearch(kind: AdminSearchKind, q: string, signal: AbortSignal): Promise<AdminSearchResult[]> {
  const response = await fetch(adminSearchUrl(kind, q), { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw new Error(`Search failed (${response.status})`)
  // The client treats the route's answer as external data.
  return adminSearchResponseSchema.parse(await response.json()).results
}

/**
 * The command menu's search for one kind (P10.16, UI-41): a GET through
 * TanStack Query, 180ms after typing stops. The last results stay up while
 * the next request runs, so the list never flashes empty. `q` is the
 * debounced query the results belong to.
 */
export function useAdminSearch(kind: AdminSearchKind, query: string, enabled = true) {
  const q = useDebouncedValue(query.trim().slice(0, ADMIN_SEARCH_MAX), DEBOUNCE_MS)
  const { data, isFetching, isError } = useQuery({
    queryKey: queryKeys.adminSearch(kind, q),
    queryFn: ({ signal }) => fetchAdminSearch(kind, q, signal),
    enabled: enabled && q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
  return { results: data ?? [], isFetching, isError, q }
}
