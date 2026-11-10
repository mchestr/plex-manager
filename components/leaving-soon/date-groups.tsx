"use client"

import { useEffect, useRef, useState } from "react"

import { type CardKeep, LeavingCard } from "@/components/leaving-soon/leaving-card"
import { Button } from "@/components/ui/button"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { plural } from "@/lib/cleanup/action-words"
import type { MemberLeavingGroup } from "@/lib/cleanup/types/member"
import { useFormat } from "@/lib/format-context"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"
import { cn } from "@/lib/utils"

const BASE = "leaving-soon"
/** A group shows this many cards from `md` before "Show all", and {@link PHONE_COUNT} below it (UX 9.2). */
const DESKTOP_COUNT = 6
const PHONE_COUNT = 4

type Filter = "all" | "movies" | "shows"
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
]

/** Shows include seasons (UX 9.2). */
const inFilter = (filter: Filter, level: Level) => filter === "all" || (filter === "movies") === (level === "movie")

/** The groups with only the titles of the filter; a group with none left goes. */
function filterGroups(groups: readonly MemberLeavingGroup[], filter: Filter): MemberLeavingGroup[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((entry) => inFilter(filter, entry.item.level))
    return items.length > 0 ? [{ ...group, items, count: items.length }] : []
  })
}

/** "12 seasons", or "3 movies, 1 show" for a group with more than one level. */
function countLine(items: MemberLeavingGroup["items"]): string {
  return LEVELS.flatMap((level) => {
    const count = items.filter((entry) => entry.item.level === level).length
    return count > 0 ? [plural(count, level)] : []
  }).join(", ")
}

interface GroupProps {
  group: MemberLeavingGroup
  keeps: ReadonlyMap<string, CardKeep>
}

/**
 * One leave day, or "Leaves any day now" for the due titles: 6 cards from
 * `md` and 4 below it, then "Show all {N}". After "Show all", focus moves to
 * the first card that was hidden.
 */
function DateGroup({ group, keeps }: GroupProps) {
  const f = useFormat()
  const list = useRef<HTMLUListElement>(null)
  const [all, setAll] = useState(false)
  // The index of the first card that "Show all" revealed, focused after the render that shows it
  const focusAt = useRef<number | null>(null)
  const due = group.date === "due"
  const base = `${BASE}-group-${group.date}`
  const shown = all ? group.items : group.items.slice(0, DESKTOP_COUNT)

  useEffect(() => {
    const index = focusAt.current
    if (index === null) return
    focusAt.current = null
    list.current?.children[index]?.querySelector<HTMLElement>("article")?.focus()
  })

  const showAll = () => {
    const desktop = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 48rem)").matches
    focusAt.current = desktop ? DESKTOP_COUNT : PHONE_COUNT
    setAll(true)
  }

  return (
    <section aria-labelledby={`${base}-title`} className="flex flex-col gap-3" data-testid={base}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h3 id={`${base}-title`} className="text-h3 text-foreground">
            {due ? "Leaves any day now" : `Leaves ${f.dayKey(group.date, "day-month-short")}`}
          </h3>
          <p className="text-label text-muted-foreground">
            {due ? "These reached their leave date. They can still be kept." : countLine(group.items)}
          </p>
        </div>
        {!all && group.count > PHONE_COUNT && (
          <Button
            variant="ghost"
            size="sm"
            className={cn("max-md:h-11", group.count <= DESKTOP_COUNT && "md:hidden")}
            onClick={showAll}
            data-testid={`${base}-show-all`}
          >
            Show all {group.count}
          </Button>
        )}
      </div>
      <ul ref={list} className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((entry, index) => (
          <li key={entry.item.itemKey} className={cn(!all && index >= PHONE_COUNT && "max-md:hidden")}>
            <LeavingCard item={entry.item} leaveAt={entry.leaveAt} keep={keeps.get(entry.item.itemKey) ?? null} />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface EverythingProps {
  groups: readonly MemberLeavingGroup[]
  /** For you holds titles, so this list holds the others ("{N} more titles"). */
  afterForYou: boolean
  keeps: ReadonlyMap<string, CardKeep>
}

/**
 * Everything leaving soon (UX 9.2): the heading, the Show control ("All {N}",
 * "Movies {N}", "Shows {N}") and the date groups, the due group first. The N
 * of the line under the heading is the N of "All".
 */
export function EverythingLeaving({ groups, afterForYou, keeps }: EverythingProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const all = groups.reduce((sum, group) => sum + group.items.length, 0)
  if (all === 0) return null
  const counts: Record<Filter, number> = {
    all,
    movies: filterGroups(groups, "movies").reduce((sum, group) => sum + group.count, 0),
    shows: filterGroups(groups, "shows").reduce((sum, group) => sum + group.count, 0),
  }
  const titles = `${all} ${afterForYou ? "more " : ""}${all === 1 ? "title" : "titles"}`
  const line = afterForYou ? `${titles}, the soonest first. Titles in For you do not repeat here.` : `${titles}, the soonest first.`

  return (
    <section aria-labelledby={`${BASE}-everything-title`} className="flex flex-col gap-6" data-testid={`${BASE}-everything`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id={`${BASE}-everything-title`} className="text-h2 text-foreground">
            Everything leaving soon
          </h2>
          <p className="text-label text-muted-foreground">{line}</p>
        </div>
        <SegmentedControl
          aria-label="Show"
          value={filter}
          onValueChange={(value) => setFilter(FILTERS.find((option) => option.value === value)?.value ?? "all")}
          data-testid={`${BASE}-filter`}
        >
          {FILTERS.map(({ value, label }) => (
            <Segment key={value} value={value} disabled={counts[value] === 0} className="max-md:h-11" data-testid={`${BASE}-filter-${value}`}>
              {label} {counts[value]}
            </Segment>
          ))}
        </SegmentedControl>
      </div>
      {filterGroups(groups, filter).map((group) => (
        <DateGroup key={group.date} group={group} keeps={keeps} />
      ))}
    </section>
  )
}
