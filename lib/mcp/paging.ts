/**
 * Paging for MCP list tools whose loader returns a whole list: the tool takes
 * `page` and `pageSize`, and its result says which rows it shows of how many,
 * so a model never takes one page for the whole.
 *
 * @module lib/mcp/paging
 */

import { z } from "zod"

/** `page` and `pageSize` fields for a tool's input, with its default and largest page. */
export function pageFields(defaultSize: number, maxSize: number) {
  return {
    page: z.number().int().min(1).max(10_000).default(1).describe("Page number, from 1"),
    pageSize: z.number().int().min(1).max(maxSize).default(defaultSize).describe(`Rows per page (default ${defaultSize}, at most ${maxSize})`),
  }
}

export interface Page<T> {
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** "showing 26-50 of 120", or "none" for an empty list. */
  showing: string
  rows: T[]
}

/** One page of `rows`. A page past the end is empty, and `showing` says so. */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const total = rows.length
  const start = (page - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)
  const showing =
    total === 0 ? "none" : slice.length === 0 ? `none on page ${page}; there are ${total}` : `showing ${start + 1}-${start + slice.length} of ${total}`
  return { total, page, pageSize, totalPages: Math.ceil(total / pageSize), showing, rows: slice }
}

/** Whether `needle` occurs in any of `fields`, ignoring case. An empty needle matches. */
export function matches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  if (!needle) return true
  const lower = needle.toLowerCase()
  return fields.some((field) => field?.toLowerCase().includes(lower))
}
