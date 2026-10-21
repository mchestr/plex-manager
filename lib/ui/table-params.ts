/**
 * The URL state of an admin list page (ui-design-system 5.5, UI-23): page,
 * page size, sort and search live in the query string, so a reload, a shared
 * link or the back button lands on the same rows.
 *
 * `parseTableParams` reads them on the server with Zod and falls back to the
 * defaults on anything it does not recognise. `tableHref` builds the next URL
 * from the current one and a patch, keeping every other param (the LLM usage
 * page lost `conversationId` on each page change).
 *
 * @module lib/ui/table-params
 */

import type { Route } from "next"
import { z } from "zod"

export interface TableSort {
  id: string
  desc: boolean
}

export interface TableParams {
  page: number
  pageSize: number
  sort: TableSort
  /** The trimmed search text, "" when there is none. */
  q: string
}

interface TableParamOptions {
  /** Column ids the server can sort by; any other `?sort=` falls back to `defaultSort`. */
  sortable: readonly string[]
  defaultSort: TableSort
  /** The first is the default. */
  pageSizes?: readonly number[]
}

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>

/** A patch for `tableHref`: `null` or `undefined` removes the param. */
export type ParamPatch = Record<string, string | number | null | undefined>

const DEFAULT_PAGE_SIZES = [25, 50, 100] as const

function first(input: SearchParamsInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined
  const value = input[key]
  return Array.isArray(value) ? value[0] : value
}

/** `name` sorts ascending and `-name` descending. */
export function sortParam(sort: TableSort): string {
  return sort.desc ? `-${sort.id}` : sort.id
}

/** Reads `page`, `pageSize`, `sort` and `q`, falling back to the defaults on bad input. */
export function parseTableParams(input: SearchParamsInput, options: TableParamOptions): TableParams {
  const pageSizes = options.pageSizes ?? DEFAULT_PAGE_SIZES
  const sortable = new Set(options.sortable)

  const page = z.coerce.number().int().min(1).max(100_000).catch(1).parse(first(input, "page") ?? 1)
  const pageSize = z.coerce
    .number()
    .int()
    .refine((size) => pageSizes.includes(size))
    .catch(pageSizes[0])
    .parse(first(input, "pageSize") ?? pageSizes[0])
  const sort = z
    .string()
    .regex(/^-?[A-Za-z][\w.]*$/)
    .transform((value): TableSort => ({ id: value.replace(/^-/, ""), desc: value.startsWith("-") }))
    .refine((value) => sortable.has(value.id))
    .catch(options.defaultSort)
    .parse(first(input, "sort"))
  const q = z.string().trim().max(100).catch("").parse(first(input, "q") ?? "")

  return { page, pageSize, sort, q }
}

/** The current URL with `patch` applied; every param the patch does not name is kept. */
export function tableHref(pathname: string, current: SearchParamsInput, patch: ParamPatch): Route {
  const params = new URLSearchParams()
  if (current instanceof URLSearchParams) {
    current.forEach((value, key) => params.append(key, value))
  } else {
    for (const [key, value] of Object.entries(current)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key)
    else params.set(key, String(value))
  }
  const query = params.toString()
  return (query ? `${pathname}?${query}` : pathname) as Route
}
