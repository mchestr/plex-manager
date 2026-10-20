"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface TablePaginationProps {
  page: number
  pageSize: number
  total: number
  /** Plural, lower case: "members". */
  noun: string
  onPageChange: (page: number) => void
  /** Shows the rows-per-page Select. */
  onPageSizeChange?: (pageSize: number) => void
  pageSizes?: readonly number[]
  className?: string
  /** The base id: `-info`, `-first`, `-previous`, `-next`, `-last`, `-page-size` hang off it. */
  testId?: string
}

/**
 * A table's footer (ui-design-system 6.3, item 6). One page reads "Showing
 * all {n} {noun}" with no pager; more pages show the range, Previous and Next.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  noun,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
  className,
  testId = "pagination",
}: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const paged = total > pageSize
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const items = pageSizes.map((size) => ({ value: String(size), label: String(size) }))

  const pageButton = (target: number, label: string, glyph: typeof ChevronLeft, id: string, disabled: boolean) => (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => onPageChange(target)}
      disabled={disabled}
      aria-label={label}
      data-testid={`${testId}-${id}`}
    >
      <Icon icon={glyph} />
    </Button>
  )

  return (
    <div
      data-slot="table-pagination"
      className={cn("flex flex-col items-center justify-between gap-3 py-3 sm:flex-row", className)}
      data-testid={testId}
    >
      <p className="text-label text-muted-foreground tabular-nums" data-testid={`${testId}-info`}>
        {paged ? `Showing ${start} to ${end} of ${total} ${noun}` : `Showing all ${total} ${noun}`}
      </p>
      {paged && (
        <div className="flex items-center gap-3">
          {onPageSizeChange && (
            <Select items={items} value={String(pageSize)} onValueChange={(value) => value && onPageSizeChange(Number(value))}>
              <SelectTrigger size="sm" className="w-20" aria-label="Rows per page" data-testid={`${testId}-page-size`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <nav aria-label="Pagination" className="flex items-center gap-1">
            {pageButton(1, "Go to first page", ChevronsLeft, "first", page <= 1)}
            {pageButton(page - 1, "Go to previous page", ChevronLeft, "previous", page <= 1)}
            <span className="px-2 text-label text-muted-foreground tabular-nums">
              Page{" "}
              <span className="text-foreground" data-testid={`${testId}-current-page`}>
                {page}
              </span>{" "}
              of{" "}
              <span className="text-foreground" data-testid={`${testId}-total-pages`}>
                {pageCount}
              </span>
            </span>
            {pageButton(page + 1, "Go to next page", ChevronRight, "next", page >= pageCount)}
            {pageButton(pageCount, "Go to last page", ChevronsRight, "last", page >= pageCount)}
          </nav>
        </div>
      )}
    </div>
  )
}
