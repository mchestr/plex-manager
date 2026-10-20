"use client"

import { TablePagination } from "@/components/ui/data-table/pagination"

interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
  /** The base test id; `pagination` by default. */
  "data-testid"?: string
}

/**
 * @deprecated Use DataTable, whose pagination lives in the URL
 * (ui-design-system 9.4). This adapter keeps today's props over
 * `TablePagination`; P10.11 deletes it.
 */
export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
  ...props
}: PaginationProps) {
  return (
    <TablePagination
      page={page}
      pageSize={pageSize}
      total={totalCount}
      noun="results"
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      pageSizes={pageSizeOptions}
      className={className}
      testId={props["data-testid"] ?? "pagination"}
    />
  )
}
