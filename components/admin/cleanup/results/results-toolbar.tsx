"use client"

import { useEffect, useEffectEvent, useState } from "react"

import { SORT_LABELS, sortsOf } from "@/components/admin/cleanup/results/view"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { icons } from "@/lib/ui/icons"
import type { PreviewSort, PreviewTab } from "@/lib/validations/cleanup-actions"

/** Typed text waits this long before it searches, like typed numbers (UX 4.3.7, 7.11 item 2). */
const SEARCH_DEBOUNCE_MS = 500

interface ResultsToolbarProps {
  tab: PreviewTab
  sort: PreviewSort
  search: string
  /** "197 movies, 1.3 TB". */
  count: string
  onSortChange: (sort: PreviewSort) => void
  /** Called with the trimmed text, 500 ms after the last key. */
  onSearch: (search: string) => void
}

/**
 * The Results toolbar: a title search on the server, the sort of the tab and
 * the muted count. The search keeps its own text while the admin types, and
 * takes a new `search` from the view when it changes elsewhere.
 */
export function ResultsToolbar({ tab, sort, search, count, onSortChange, onSearch }: ResultsToolbarProps) {
  const [typed, setTyped] = useState(search)
  const [seen, setSeen] = useState(search)
  if (search !== seen) {
    setSeen(search)
    // Our own search comes back trimmed: keep the box as typed, so a space before the next word stays
    if (typed.trim() !== search) setTyped(search)
  }

  const send = useEffectEvent((text: string) => onSearch(text))
  useEffect(() => {
    const text = typed.trim()
    if (text === search) return
    const timer = setTimeout(() => send(text), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [typed, search])

  const sorts = sortsOf(tab)
  const items = sorts.map((value) => ({ value, label: SORT_LABELS[value] }))

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="w-full md:w-72">
        <Input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Search titles"
          aria-label="Search titles"
          maxLength={100}
          leading={<Icon icon={icons.search} />}
          data-testid="admin-cleanup-results-search"
        />
      </div>
      <Select items={items} value={sort} onValueChange={(value) => value && onSortChange(value)}>
        <SelectTrigger aria-label="Sort" className="w-48" data-testid="admin-cleanup-results-sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label} data-testid={`admin-cleanup-results-sort-${item.value}`}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-ui text-muted-foreground tabular-nums md:ml-auto" data-testid="admin-cleanup-results-count">
        {count}
      </p>
    </div>
  )
}
