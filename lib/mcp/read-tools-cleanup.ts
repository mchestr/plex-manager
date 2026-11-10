/**
 * The media cleanup reads as MCP tools (TS 10.8): the Rules tab, one rule,
 * the turn-on review, Leaving soon with its batches, the Keeps and
 * exclusions, the runs, the deleted titles and the settings. Each calls the
 * loader behind its admin tab, so the loader's own `assertAdmin()` and audit
 * row apply too. Lists page with `page` and `pageSize` (at most 50 rows, or
 * 25 rules in the overview). Rows leave out poster keys and Plex links, and
 * sentences come as text, so a result stays under the size cap
 * (`lib/mcp/result-limit.ts`).
 *
 * No tool turns a rule on or approves a deletion batch (TS E24): a person
 * does both on the admin pages. `get_cleanup_turn_on` reads what the review
 * page shows, and `list_cleanup_leaving_soon` gives each batch's `count`,
 * `keysHash` and `reviewedAt`, which `approve_cleanup_entry_batch` and the
 * batch form of Postpone and Exclude take.
 *
 * @module lib/mcp/read-tools-cleanup
 */

import "server-only"

import { z } from "zod"

import { ITEM_STATUSES, RESULTS_PAGE_SIZE } from "@/lib/cleanup/constants"
import { describeRule, plainText } from "@/lib/cleanup/describe"
import type { WhyPart } from "@/lib/cleanup/engine/types"
import { describeContext, ruleRequesterIds } from "@/lib/cleanup/preview/draft"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import { UNREADABLE_SENTENCE } from "@/lib/cleanup/screens/overview/rule-cards"
import { loadPreviousCompleteHeader } from "@/lib/cleanup/snapshot/store"
import type { BatchData, BatchRow, DeletionBatchData, LeavingRow, ProtectionRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupHistoryData } from "@/lib/cleanup/types/screens"
import { getCleanupHistory } from "@/lib/data/cleanup-history"
import { getCleanupLeavingSoon } from "@/lib/data/cleanup-leaving"
import { getCleanupOverview } from "@/lib/data/cleanup-overview"
import { getCleanupProtections } from "@/lib/data/cleanup-protections"
import { getCleanupSettings } from "@/lib/data/cleanup-settings"
import { getCleanupTurnOn } from "@/lib/data/cleanup-turn-on"
import { type Page, pageFields, paginate } from "@/lib/mcp/paging"
import { clip, readTool } from "@/lib/mcp/read-tool"
import type { McpTool } from "@/lib/mcp/types"
import { prisma } from "@/lib/prisma"
import { parseBatchId, ruleIdSchema } from "@/lib/validations/cleanup-actions"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { MODES, type Mode } from "@/lib/validations/cleanup-vocabulary"

/** The page size that the tools ask the list loaders for. A tool page reads the one or two loader pages that hold it. */
const LOADER_SIZE = RESULTS_PAGE_SIZE

/** The most of an exclusion note that a list row carries. */
const NOTE_CHARS = 200

const qArg = z.string().trim().max(100).default("").describe("Part of a title")
const deletionBatchArg = z.string().max(50).refine((id) => parseBatchId(id)?.kind === "deletion", "Not a deletion batch id")

/** The loader search params: the values that are set, as strings. */
function params(values: Record<string, string | number | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]])))
}

type LoaderPage<R, T> = { data: R; rows: T[]; total: number }

/**
 * One tool page of a list whose loader pages by {@link LOADER_SIZE}: the rows
 * of the loader pages that hold it, with the counts and the `showing` words of
 * `paginate()`. `data` is the first loader page read.
 */
async function toolPage<R, T>(page: number, pageSize: number, load: (loaderPage: number) => Promise<LoaderPage<R, T>>): Promise<{ data: R; list: Page<T> }> {
  const first = Math.floor(((page - 1) * pageSize) / LOADER_SIZE) + 1
  const head = await load(first)
  const window = paginate(Array.from({ length: head.total }, (_, index) => index), page, pageSize)
  const lastIndex = window.rows.at(-1)
  const last = lastIndex === undefined ? first : Math.floor(lastIndex / LOADER_SIZE) + 1
  const loaded = last > first ? [...head.rows, ...(await load(last)).rows] : head.rows
  const offset = (first - 1) * LOADER_SIZE
  return { data: head.data, list: { ...window, rows: window.rows.flatMap((index) => (index - offset < loaded.length ? [loaded[index - offset]] : [])) } }
}

/** A tool page of a list loader that takes `page` and `size` in its search params, with `query` as its filters. */
function loaderList<R extends { total: number }, T>(load: (params: Record<string, string>) => Promise<R>, query: Record<string, string | undefined>,
  { page, pageSize }: { page: number; pageSize: number }, rowsOf: (data: R) => T[]) {
  return toolPage(page, pageSize, async (loaderPage) => {
    const data = await load(params({ ...query, page: loaderPage, size: LOADER_SIZE }))
    return { data, rows: rowsOf(data), total: data.total }
  })
}

const leavingRow = ({ posterKey: _posterKey, plexUrl: _plexUrl, statusValues: _values, group: _group, ...row }: LeavingRow) => row
const batchRow = ({ posterKey: _posterKey, ...row }: BatchRow) => row
const noPoster = <T extends { posterKey: string | null }>({ posterKey: _posterKey, ...row }: T) => row

/** A batch card without its title rows: `batch` pages those. */
const withoutRows = ({ rows: _rows, rowsPage: _page, rowsPageCount: _pages, ...summary }: DeletionBatchData) => summary
const batchSummary = (batch: BatchData) => (batch.kind === "entry" ? batch : withoutRows(batch))
const runsOf = ({ runs, nextRunAt }: CleanupHistoryData) => ({ runs, nextRunAt })

function protectionRow({ posterKey: _posterKey, note, ...row }: ProtectionRow) {
  const clipped = clip(note, NOTE_CHARS)
  return { ...row, note: clipped.text, noteTruncated: clipped.truncated }
}

/** The rule in plain words, with the library titles of the newest library data and the member names of its requester conditions. */
async function ruleSentence(definition: RuleDefinition, mode: Mode | null): Promise<string> {
  const ids = ruleRequesterIds(definition)
  const [header, users] = await Promise.all([loadPreviousCompleteHeader(), ids.length === 0 ? []
    : prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, plexUserId: true, name: true, accessEndedAt: true } })])
  const live = { members: users.map(({ id, ...user }) => ({ userId: id, ...user })) }
  return plainText(describeRule(definition, describeContext(header?.facts?.libraries ?? [], live, mode)))
}

/** One rule (TS 10.8), or null. `revision` is the `expectedRevision` that `saveCleanupRule` needs (architecture-r3-3). */
async function readRule(ruleId: string) {
  const select = { id: true, name: true, mode: true, revision: true, definition: true, stats: true, turnedOnAt: true } as const
  const rule = await prisma.cleanupRule.findUnique({ where: { id: ruleId }, select })
  if (!rule) return null
  const parsed = parseRuleDefinition(rule.definition)
  const sentence = parsed.ok ? await ruleSentence(parsed.definition, MODES.find((mode) => mode === rule.mode) ?? null) : UNREADABLE_SENTENCE
  return { id: rule.id, name: rule.name, mode: rule.mode, revision: rule.revision, definition: parsed.ok ? parsed.definition : null, sentence,
    stats: parseRuleStats(rule.stats), turnedOnAt: rule.turnedOnAt?.toISOString() ?? null }
}

/** Every media cleanup read tool. */
export function cleanupReadTools(): McpTool[] {
  return [
    readTool({
      name: "get_cleanup_overview",
      description: "Media cleanup at a glance (the Rules tab): whether it is on or paused, the library data and its sources, the safety stops, the library and stat tiles, the batches that wait for an admin, the ten recipes with today's counts, and the rules with their id, mode, `revision`, plain words, matches, dry runs and footer line. The rules page with page and pageSize.",
      // A rule card with its facts and plain words is about 1,100 characters, so 25 rules stay under the size cap
      input: z.object(pageFields(20, 25)),
      read: async ({ page, pageSize }) => {
        const { rules, recipes, ...overview } = await getCleanupOverview()
        const asText = <T extends { posters: string[]; sentence: WhyPart[] }>({ posters: _posters, sentence, ...card }: T) => ({ ...card, sentence: plainText(sentence) })
        return { ...overview, recipes: recipes.map(asText), rules: paginate(rules.map(asText), page, pageSize) }
      },
    }),
    readTool({ name: "get_cleanup_rule", input: z.object({ ruleId: ruleIdSchema }), read: ({ ruleId }) => readRule(ruleId),
      description: "One media cleanup rule by id: its name, mode, `revision`, whole definition, the rule in plain words, its stats (the newest evaluation and up to 30 dry runs) and when it was last turned on. save_cleanup_rule takes the id as `ruleId`, the name, the definition, and `revision` as `expectedRevision`." }),
    readTool({
      name: "get_cleanup_turn_on",
      description: "The turn-on review of a media cleanup rule, as its review page shows it: the checks and which ones block, the titles that would join Leaving soon, the leave date, who sees them, the budget, the dry runs, the 10 largest titles, the modes it allows, `revision`, `count` and `keysHash`. mode is the mode to review (default: Review first, or Automatic for a rule in Review first). No tool turns a rule on: a person does it on the review page.",
      input: z.object({ ruleId: ruleIdSchema, mode: z.enum(["reviewFirst", "automatic"]).optional() }),
      read: async ({ ruleId, mode }) => {
        const data = await getCleanupTurnOn(ruleId, mode)
        if (!data) return null
        const { posters: _posters, ...batch } = data.batch
        const largest = data.largest.map(({ posterKey: _posterKey, why, ...row }) => ({ ...row, why: plainText(why) }))
        return { ...data, rule: { ...data.rule, sentence: plainText(data.rule.sentence) }, batch, largest }
      },
    }),
    readTool({
      name: "list_cleanup_leaving_soon",
      description: "Media cleanup Leaving soon: every deletion batch and entry batch that waits for an admin, with its `id`, `count`, `keysHash` and `reviewedAt` (approve_cleanup_entry_batch, and the `batch` form of postpone_cleanup_items and exclude_cleanup_items, take them), and one page of the other titles in Leaving soon with their status and leave date. Filter the titles by rule (a rule id), status, library (a section id) and q (part of a title); a filter never hides a batch. With batch (a deletion batch id), it pages the titles of that batch instead, largest first. Pages with page and pageSize.",
      input: z.object({ rule: ruleIdSchema.optional(), status: z.enum(ITEM_STATUSES).optional(),
        library: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional().describe("A Plex section id"), q: qArg,
        batch: deletionBatchArg.optional().describe("A deletion batch id: list its titles"), ...pageFields(25, 50) }),
      read: async ({ batch, page, pageSize, ...filters }) => {
        if (batch) {
          const { data, list } = await toolPage(page, pageSize, async (batchPage) => {
            const card = (await getCleanupLeavingSoon(params({ batch, batchPage }))).batches.find((each) => each.id === batch)
            return { data: card ?? null, rows: card?.kind === "deletion" ? card.rows.map(batchRow) : [], total: card?.count ?? 0 }
          })
          return data && { batch: batchSummary(data), ...list }
        }
        const { data, list } = await loaderList(getCleanupLeavingSoon, filters, { page, pageSize }, (leaving) => leaving.rows.map(leavingRow))
        const { feature, budget, exits7d, filters: choices, totals } = data
        return { feature, budget, exits7d, filters: choices, totals, batches: data.batches.map(batchSummary), ...list }
      },
    }),
    readTool({
      name: "list_cleanup_protections",
      description: `Media cleanup Keeps by members and exclusions by admins that protect a title now, newest first, with the four tiles. Filter by kind (keep or exclude) and q (part of a title); pages with page and pageSize. The ids are for remove_cleanup_keep, remove_cleanup_exclusion and set_cleanup_exclusion_end. A note shows its first ${NOTE_CHARS} characters.`,
      input: z.object({ kind: z.enum(["keep", "exclude"]).optional(), q: qArg, ...pageFields(25, 50) }),
      read: async ({ kind, q, ...paging }) => {
        const { data, list } = await loaderList(getCleanupProtections, { kind, q }, paging, (protections) => protections.rows.map(protectionRow))
        return { tiles: data.tiles, ...list }
      },
    }),
    readTool({ name: "list_cleanup_runs", read: async () => runsOf(await getCleanupHistory(params({ size: 25 }))),
      description: "The newest 30 media cleanup runs, dry runs and deletion steps, newest first: when each started and finished, who started it, its rules, its counts (checked, joined, rescued, deleted, failed, freed bytes), its outcome code and its safety stops. Also when the next nightly run starts." }),
    readTool({
      name: "list_cleanup_deleted",
      description: "Titles that media cleanup deleted or failed to delete, and records that a failed delete left unmonitored in Radarr or Sonarr, newest first, with the rule, the freed bytes, who approved it and the cause. Filter by rule (a rule id) and q (part of a title); pages with page and pageSize.",
      input: z.object({ rule: ruleIdSchema.optional(), q: qArg, ...pageFields(25, 50) }),
      read: async ({ rule, q, ...paging }) => {
        const { data, list } = await loaderList(getCleanupHistory, { rule, q }, paging, (history) => history.deleted.map(noPoster))
        return { rules: data.filters.rules, ...list }
      },
    }),
    readTool({ name: "get_cleanup_settings", read: () => getCleanupSettings(),
      description: "The media cleanup settings: the switch, the pause and the hold date, the global protections with their values and how many titles each protects, the deletion budget and the entry check, the rule defaults, the Plex collections, the member options, the nightly schedule, the library data and the last run. update_cleanup_settings saves one section." }),
  ]
}
