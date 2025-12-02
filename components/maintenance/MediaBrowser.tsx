"use client"

import { StyledInput } from "@/components/ui/styled-input"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import type { MediaItem } from "@/lib/maintenance/rule-evaluator"
import type { MediaType, RuleCriteria } from "@/lib/validations/maintenance"
import { evaluateRuleClient } from "@/lib/maintenance/client-evaluator"
import { useQuery } from "@tanstack/react-query"
import { useState, useMemo, useCallback, useEffect, useRef } from "react"

interface MediaBrowserProps {
  mediaType: MediaType
  selectedItem: MediaItem | null
  onSelectItem: (item: MediaItem | null) => void
  criteria: RuleCriteria
}

interface MediaResponse {
  items: MediaItem[]
  error?: string
}

type FilterMode = 'all' | 'matching' | 'not-matching'

export function MediaBrowser({ mediaType, selectedItem, onSelectItem, criteria }: MediaBrowserProps) {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // Proper debounce with cleanup
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const { data, isLoading, error } = useQuery<MediaResponse>({
    queryKey: ['maintenance', 'media', mediaType, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        mediaType,
        search: debouncedSearch,
        limit: '50',
      })
      const response = await fetch(`/api/admin/maintenance/media?${params}`)
      if (!response.ok) throw new Error('Failed to fetch media')
      return response.json()
    },
    staleTime: 30 * 1000, // 30 seconds
  })

  const handleSelect = useCallback((item: MediaItem) => {
    if (selectedItem?.id === item.id) {
      onSelectItem(null)
    } else {
      onSelectItem(item)
    }
  }, [selectedItem, onSelectItem])

  const items = data?.items || []

  // Evaluate all items against the current criteria
  const evaluatedItems = useMemo(() => {
    return items.map(item => ({
      item,
      matches: evaluateRuleClient(item, criteria)
    }))
  }, [items, criteria])

  // Filter based on mode
  const filteredItems = useMemo(() => {
    switch (filterMode) {
      case 'matching':
        return evaluatedItems.filter(e => e.matches)
      case 'not-matching':
        return evaluatedItems.filter(e => !e.matches)
      default:
        return evaluatedItems
    }
  }, [evaluatedItems, filterMode])

  // Match statistics
  const matchCount = evaluatedItems.filter(e => e.matches).length
  const totalCount = evaluatedItems.length

  // Auto-select first item when items load and nothing selected
  useEffect(() => {
    if (!selectedItem && filteredItems.length > 0 && !isLoading) {
      onSelectItem(filteredItems[0].item)
    }
  }, [filteredItems, selectedItem, onSelectItem, isLoading])

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
      {/* Header with match summary */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-400">Test Media</h3>
        {!isLoading && totalCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-medium ${matchCount > 0 ? 'text-green-400' : 'text-slate-500'}`}>
              {matchCount}
            </span>
            <span className="text-xs text-slate-500">/</span>
            <span className="text-xs text-slate-500">{totalCount} match</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-3">
        <StyledInput
          type="text"
          placeholder={`Search ${mediaType === 'MOVIE' ? 'movies' : 'series'}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="media-browser-search"
          className="text-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3 bg-slate-900/50 p-1 rounded-lg">
        <FilterTab
          active={filterMode === 'all'}
          onClick={() => setFilterMode('all')}
          label="All"
          count={totalCount}
        />
        <FilterTab
          active={filterMode === 'matching'}
          onClick={() => setFilterMode('matching')}
          label="Matching"
          count={matchCount}
          variant="success"
        />
        <FilterTab
          active={filterMode === 'not-matching'}
          onClick={() => setFilterMode('not-matching')}
          label="Not Matching"
          count={totalCount - matchCount}
          variant="danger"
        />
      </div>

      {error && (
        <div className="text-red-400 text-sm mb-3">
          {error instanceof Error ? error.message : 'Failed to load media'}
        </div>
      )}

      {data?.error && (
        <div className="text-amber-400 text-sm mb-3">
          {data.error}
        </div>
      )}

      {/* Media list */}
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <LoadingSpinner label="Loading media" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            {debouncedSearch
              ? 'No media found matching your search'
              : filterMode !== 'all'
                ? `No ${filterMode === 'matching' ? 'matching' : 'non-matching'} items`
                : 'No media available'
            }
          </div>
        ) : (
          filteredItems.map(({ item, matches }) => (
            <CompactMediaCard
              key={item.id}
              item={item}
              matches={matches}
              isSelected={selectedItem?.id === item.id}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface FilterTabProps {
  active: boolean
  onClick: () => void
  label: string
  count: number
  variant?: 'default' | 'success' | 'danger'
}

function FilterTab({ active, onClick, label, count, variant = 'default' }: FilterTabProps) {
  const countColor = {
    default: 'text-slate-400',
    success: 'text-green-400',
    danger: 'text-red-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors
        ${active
          ? 'bg-slate-700 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }
      `}
    >
      {label}
      <span className={`ml-1 ${active ? 'text-slate-300' : countColor[variant]}`}>
        {count}
      </span>
    </button>
  )
}

interface CompactMediaCardProps {
  item: MediaItem
  matches: boolean
  isSelected: boolean
  onSelect: (item: MediaItem) => void
}

function CompactMediaCard({ item, matches, isSelected, onSelect }: CompactMediaCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`
        w-full text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-3
        ${isSelected
          ? 'bg-cyan-900/30 border-cyan-500/50'
          : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
        }
      `}
      data-testid={`media-item-${item.id}`}
    >
      {/* Match indicator */}
      <div className={`
        w-2 h-2 rounded-full flex-shrink-0
        ${matches ? 'bg-green-400' : 'bg-red-400'}
      `} />

      {/* Title and year */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{item.title}</p>
        <p className="text-xs text-slate-500">{item.year || 'N/A'}</p>
      </div>

      {/* Quick status */}
      <div className="text-right text-xs flex-shrink-0">
        {item.playCount !== undefined && (
          <p className={item.playCount > 0 ? 'text-slate-400' : 'text-amber-400'}>
            {item.playCount > 0 ? `${item.playCount} plays` : 'Unwatched'}
          </p>
        )}
      </div>
    </button>
  )
}
