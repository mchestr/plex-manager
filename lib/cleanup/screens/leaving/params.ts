/**
 * The URL params of the Leaving soon, Kept and excluded and History tabs
 * (TS 10.4). `q`, `page` and the page size go through `parseTableParams()`
 * (`lib/ui/table-params.ts`). The page size is `pageSize`, which the
 * `DataTable` size select writes, else `size` (the TS 10.4 name). The
 * filters go through Zod. A value that does not parse falls back to its
 * default, so a hand-edited URL never throws. Client-safe.
 *
 * | Tab | Params |
 * |---|---|
 * | Leaving soon | `q`, `rule`, `status`, `library`, `page`, `size`, and `batch` with `batchPage` for the rows of a deletion batch |
 * | Kept and excluded | `q`, `kind` (`keep` or `exclude`), `page`, `size` |
 * | History | `q`, `rule`, `page`, `size` |
 *
 * `batchPage` pages the rows of the deletion batch that `batch` names, 50 a
 * page. Without `batch`, it pages every deletion batch.
 *
 * @module lib/cleanup/screens/leaving/params
 */

import { z } from "zod"

import { ITEM_STATUSES, type ItemStatus, RESULTS_PAGE_SIZE } from "@/lib/cleanup/constants"
import { parseTableParams, type SearchParamsInput } from "@/lib/ui/table-params"
import { parseBatchId, ruleIdSchema } from "@/lib/validations/cleanup-actions"

/** The page sizes of a list tab. The first is the default: 50 items a page (UX 4.7.2). */
export const LIST_PAGE_SIZES = [RESULTS_PAGE_SIZE, 25, 100] as const

const NO_SORT = { id: "default", desc: false }
const sectionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const pageSchema = z.coerce.number().int().min(1).max(100_000)

function first(input: SearchParamsInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined
  const value = input[key]
  return Array.isArray(value) ? value[0] : value
}

/** The parsed value, or null when the param is missing or does not parse. */
function optional<T>(schema: z.ZodType<T>, value: string | undefined): T | null {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}

interface ListParams {
  /** The trimmed search text, "" when there is none. */
  q: string
  page: number
  size: number
}

/** `q`, `page` and the page size of a list tab: `pageSize` (the `DataTable` select), else `size`. @internal */
export function parseListParams(input: SearchParamsInput): ListParams {
  const table = parseTableParams(
    { q: first(input, "q"), page: first(input, "page"), pageSize: first(input, "pageSize") ?? first(input, "size") },
    { sortable: [], defaultSort: NO_SORT, pageSizes: LIST_PAGE_SIZES }
  )
  return { q: table.q, page: table.page, size: table.pageSize }
}

export interface LeavingParams extends ListParams {
  rule: string | null
  status: ItemStatus | null
  library: string | null
  /** The deletion batch that `batchPage` pages, or null for every deletion batch. */
  batch: string | null
  batchPage: number
}

/** The params of the Leaving soon tab. */
export function parseLeavingParams(input: SearchParamsInput): LeavingParams {
  const batch = first(input, "batch")
  return {
    ...parseListParams(input),
    rule: optional(ruleIdSchema, first(input, "rule")),
    status: optional(z.enum(ITEM_STATUSES), first(input, "status")),
    library: optional(sectionIdSchema, first(input, "library")),
    batch: batch !== undefined && parseBatchId(batch)?.kind === "deletion" ? batch : null,
    batchPage: optional(pageSchema, first(input, "batchPage")) ?? 1,
  }
}

/** The page of the rows of one deletion batch. */
export function batchPageOf(params: Pick<LeavingParams, "batch" | "batchPage">, batchId: string): number {
  return params.batch === null || params.batch === batchId ? params.batchPage : 1
}

export interface ProtectionsParams extends ListParams {
  kind: "keep" | "exclude" | null
}

/** The params of the Kept and excluded tab. */
export function parseProtectionsParams(input: SearchParamsInput): ProtectionsParams {
  return { ...parseListParams(input), kind: optional(z.enum(["keep", "exclude"]), first(input, "kind")) }
}

export interface HistoryParams extends ListParams {
  rule: string | null
}

/** The params of the History tab (the deleted titles; the runs have no paging). */
export function parseHistoryParams(input: SearchParamsInput): HistoryParams {
  return { ...parseListParams(input), rule: optional(ruleIdSchema, first(input, "rule")) }
}
