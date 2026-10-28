"use client"

import { ListFilter, Search, X } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useReplaceParams } from "@/hooks/use-replace-params"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
}

interface FilterDef {
  param: string
  label: string
  options: Option[]
  /** "all" unless said otherwise; a filter at its default shows no chip and is not in the URL. */
  defaultValue?: string
}

interface FilterSelectProps extends FilterDef {
  className?: string
  "data-testid"?: string
}

/**
 * P3.5's Select bound to one query param, with its FieldLabel (UI-13). Changing it goes back to page 1.
 * Options carry `${testId}-option-<value>`.
 */
function FilterSelect({ param, label, options, defaultValue = "all", className, ...props }: FilterSelectProps) {
  const { searchParams, replace } = useReplaceParams()
  const value = searchParams.get(param) ?? defaultValue

  return (
    <Field className={cn("min-w-36", className)}>
      <FieldLabel nativeLabel={false} render={<div />}>
        {label}
      </FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => replace({ [param]: !next || next === defaultValue ? null : next, page: null })}
      >
        <SelectTrigger size="sm" data-testid={props["data-testid"]}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
              data-testid={props["data-testid"] && `${props["data-testid"]}-option-${option.value}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function SearchField({ param, placeholder, testId }: { param: string; placeholder: string; testId: string }) {
  const { searchParams, replace } = useReplaceParams()
  const urlValue = searchParams.get(param) ?? ""
  const [value, setValue] = useState(urlValue)
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue)

  // The URL changed from outside (Clear filters, back button): show it.
  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue)
    if (value.trim() !== urlValue) setValue(urlValue)
  }

  useEffect(() => {
    if (value.trim() === urlValue) return
    const timer = setTimeout(() => replace({ [param]: value.trim() || null, page: null }), 250)
    return () => clearTimeout(timer)
  }, [value, urlValue, param, replace])

  return (
    <Input
      type="search"
      aria-label={placeholder}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      leading={<Icon icon={Search} />}
      className="w-full"
      data-testid={`${testId}-search`}
    />
  )
}

interface FilterBarProps {
  search?: { param: string; placeholder: string }
  filters: FilterDef[]
  /** Shown only while the DataTable around the bar renders cards; the first option is the default. A table sorts from its headers. */
  sort?: { param: string; options: Option[] }
  /** Announced politely: "7 members", or "3 of 7 members". */
  resultCount: { shown: number; total: number; noun: string }
  className?: string
  "data-testid"?: string
}

/**
 * The toolbar above a DataTable (ui-design-system 5.5): search into `?q=`
 * after a 250ms pause, one FilterSelect per filter, chips for the filters
 * that differ from their defaults with "Clear filters", and the result count.
 * It follows the DataTable it sits in (its `toolbar`): while the rows render
 * as cards, the Selects move into a bottom Sheet behind "Filters" beside the
 * Sort Select. Outside a DataTable the bar stays inline.
 */
export function FilterBar({ search, filters, sort, resultCount, className, ...props }: FilterBarProps) {
  const testId = props["data-testid"] ?? "filter-bar"
  const { searchParams, replace } = useReplaceParams()

  const active = filters.flatMap((filter) => {
    const value = searchParams.get(filter.param)
    const defaultValue = filter.defaultValue ?? "all"
    if (value === null || value === defaultValue) return []
    const option = filter.options.find((item) => item.value === value)
    return [{ filter, label: option?.label ?? value }]
  })
  const searching = search ? Boolean(searchParams.get(search.param)) : false

  const clearAll = () => {
    const patch: Record<string, null> = { page: null }
    for (const filter of filters) patch[filter.param] = null
    if (search) patch[search.param] = null
    replace(patch)
  }

  const count =
    resultCount.shown === resultCount.total
      ? `${resultCount.total} ${resultCount.noun}`
      : `${resultCount.shown} of ${resultCount.total} ${resultCount.noun}`
  const sortValue = sort ? (searchParams.get(sort.param) ?? sort.options[0]?.value) : undefined

  return (
    <div data-slot="filter-bar" className={cn("flex flex-col gap-3", className)} data-testid={testId}>
      <div className="flex flex-wrap items-end gap-3">
        {search && (
          <div className="max-w-80 min-w-48 grow basis-60 dt-cards:max-w-none">
            <SearchField param={search.param} placeholder={search.placeholder} testId={testId} />
          </div>
        )}
        {filters.map((filter) => (
          <FilterSelect key={filter.param} {...filter} className="dt-cards:hidden" data-testid={`${testId}-filter-${filter.param}`} />
        ))}
        {(filters.length > 0 || sort) && (
          <div className="hidden min-w-0 grow basis-72 gap-3 dt-cards:flex">
            {filters.length > 0 && (
              <Sheet>
                <SheetTrigger render={<Button variant="outline" size="sm" className="flex-1" data-testid={`${testId}-filters-open`} />}>
                  <Icon icon={ListFilter} />
                  Filters
                  {active.length > 0 && <Badge variant="info">{active.length}</Badge>}
                </SheetTrigger>
                <SheetContent side="bottom" grabber>
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-4">
                    {filters.map((filter) => (
                      <FilterSelect key={filter.param} {...filter} data-testid={`${testId}-sheet-filter-${filter.param}`} />
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
            {sort && (
              <Select
                items={sort.options}
                value={sortValue}
                onValueChange={(next) => replace({ [sort.param]: !next || next === sort.options[0]?.value ? null : next, page: null })}
              >
                <SelectTrigger size="sm" aria-label="Sort" className="w-auto min-w-0 flex-1" data-testid={`${testId}-sort`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sort.options.map((option) => (
                    <SelectItem key={option.value} value={option.value} label={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
        <p
          aria-live="polite"
          className="ml-auto pb-1.5 text-label whitespace-nowrap text-muted-foreground tabular-nums dt-cards:ml-0 dt-cards:self-center dt-cards:pb-0"
          data-testid={`${testId}-count`}
        >
          {count}
        </p>
      </div>
      {(active.length > 0 || searching) && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map(({ filter, label }) => (
            <span
              key={filter.param}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong pr-1 pl-2.5 text-label text-foreground"
              data-testid={`${testId}-chip-${filter.param}`}
            >
              {filter.label}: {label}
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={`Remove the ${filter.label} filter`}
                data-testid={`${testId}-chip-${filter.param}-remove`}
                onClick={() => replace({ [filter.param]: null, page: null })}
              >
                <Icon icon={X} size={14} />
              </Button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={clearAll} data-testid={`${testId}-clear`}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
