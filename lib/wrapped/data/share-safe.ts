/**
 * The share-safe projection of a v3 Rewind (design 6.1, SEC-16, RWP-01).
 *
 * ## Overview
 *
 * Every card is public, whether it is rendered for the owner's share sheet or
 * for a link, so every card reads this projection and nothing else. It is an
 * allow-list built field by field (no spread, no delete-list) and finished
 * with the strict `ShareSafeRewindV3` parse, so an unlisted key fails loudly.
 *
 * ## Rules
 *
 * - Only the pages in `options.pages` that the issue printed, in registry
 *   order, each with only its registry `share.facts` displays (never raw
 *   values). Title facts go to `titles`, everything else to `facts`.
 * - Counts that reveal the server's size (`standing.members`, rarity counts,
 *   `community.*`, viewer counts) only with `Config.rewindPublicCounts`; the
 *   percentage facts stand in for them.
 * - The percentile only at top 25% or better.
 * - The soundtrack as 48 weekly bins unless `dailyDetail`.
 * - `ownerName` only when signed; `brand` only when the admin shows the
 *   server name; art only when the member includes it and the admin allows it.
 * - The archetype, and every `archetype.*` fact, only on pages 16 and 18.
 * - Hidden titles (`ctx.hiddenKeys`) leave `titles` and `art` at once, and a
 *   headline that would name one prints its title-free line instead.
 * - Never: other members, ids, emails, request titles, the dedication or any
 *   model text but the enum poster line.
 *
 * @module lib/wrapped/data/share-safe
 */

import { registry, type IssuePageType, type RegistryEntry } from "@/lib/rewind/registry"
import { soundtrack, yearDays } from "@/lib/rewind/viz/soundtrack"
import { getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import { POSTER_LINES } from "@/lib/wrapped/copy/poster-lines"
import { renderCopyText, tokenIds } from "@/lib/wrapped/copy/render-copy"
import { copyLocals, headline, posterLineTemplate, titleFreeHeadline } from "@/lib/wrapped/copy/templates"
import { FACTS, type FactId, type RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import {
  CARD_FACT_IDS,
  ShareSafeRewindV3,
  type CardFactId,
  type ShareContext,
  type ShareOptions,
  type ShareSafePage,
  type SharePageType,
} from "./share-safe-schema"

const SERVER_COUNTS = /^(standing\.members|archetype\.(rarityCount|scoredMembers)|community\..+|series\[\d\]\.viewer(Count|Rank))$/
const ARCHETYPE_PAGES: ReadonlySet<IssuePageType> = new Set(["centrefold", "back-cover"])
const SOUNDTRACK_PAGES: ReadonlySet<IssuePageType> = new Set(["cover", "number", "centrefold", "back-cover"])
const HOURS_PAGES: ReadonlySet<IssuePageType> = new Set(["clock", "centrefold"])
const TOP_PERCENTILE = 25
const MAX_DISPLAY = 80
const RATING_KEY = /^\d{1,12}$/

const isTitle = (id: FactId) => FACTS[id].unit === "title"

/**
 * Rating keys of the title facts every stored page knows, over the whole issue.
 * Every key a page reports for a fact is kept, so a fact is hidden when any of
 * them is; the last one reported is the one its art is published by.
 */
function titleKeys(rewind: RewindDataV3): Partial<Record<FactId, string[]>> {
  const keys: Partial<Record<FactId, string[]>> = {}
  for (const page of rewind.pages) {
    if (page.type === "short-list") continue
    const entry: RegistryEntry = registry[page.type]
    const parsed = entry.schema.safeParse(page.data)
    if (!parsed.success || !entry.share.titleKeys) continue
    for (const [id, key] of Object.entries(entry.share.titleKeys(parsed.data)) as [FactId, string][]) {
      keys[id] = [...(keys[id] ?? []), key]
    }
  }
  return keys
}

/** The title facts that are hidden: by key, or by printing the same title as one hidden by key. */
function hiddenTitleFacts(rewind: RewindDataV3, keys: Partial<Record<FactId, string[]>>, ctx: ShareContext): Set<FactId> {
  const hiddenByKey = (id: FactId) => (keys[id] ?? []).some((key) => ctx.hiddenKeys.has(key))
  const ids = Object.keys(rewind.facts) as FactId[]
  const hiddenDisplays = new Set(ids.filter(hiddenByKey).map((id) => rewind.facts[id]?.display))
  return new Set(ids.filter((id) => isTitle(id) && (hiddenByKey(id) || hiddenDisplays.has(rewind.facts[id]?.display))))
}

/** Whether `id` may print on `page` under these options and flags. */
function mayPrint(id: FactId, page: IssuePageType, facts: RewindFactsV3, ctx: ShareContext): boolean {
  if (id.startsWith("archetype.") && !ARCHETYPE_PAGES.has(page)) return false
  if (id === "member.firstName") return false
  if (!ctx.publicCounts && SERVER_COUNTS.test(id)) return false
  if (id === "standing.percentile") {
    const value = facts[id]?.value
    return typeof value === "number" && value <= TOP_PERCENTILE
  }
  return (facts[id]?.display.length ?? Infinity) <= MAX_DISPLAY || isTitle(id)
}

function soundtrackOf(rewind: RewindDataV3, daily: boolean): ShareSafePage["soundtrack"] {
  const cover = rewind.pages.find((page) => page.type === "cover")
  const parsed = cover ? registry.cover.schema.safeParse(cover.data) : null
  if (!parsed?.success) return null
  const { minutes } = parsed.data
  if (daily) {
    const max = Math.max(0, ...minutes)
    return { grain: "daily", bins: minutes.map((m) => (max > 0 ? m / max : 0)) }
  }
  const window = { from: rewind.window.from, days: yearDays(rewind.window.from) }
  return { grain: "weekly", bins: soundtrack(minutes, { variant: "weekly", window, width: 48, height: 2 }).bins }
}

/** The page's 24 hours, normalised to the busiest, from its own stored data. */
function hoursOf(rewind: RewindDataV3, type: IssuePageType): number[] | null {
  if (!HOURS_PAGES.has(type)) return null
  const page = rewind.pages.find((p) => p.type === type)
  const parsed = page ? (type === "clock" ? registry.clock : registry.centrefold).schema.safeParse(page.data) : null
  if (!parsed?.success) return null
  const max = Math.max(0, ...parsed.data.hours)
  return max > 0 ? parsed.data.hours.map((n) => n / max) : null
}

/** The stat each page's own graphic already shows: the centrefold's clock shows the peak hour. */
const SHOWN_BY_GRAPHIC: Partial<Record<IssuePageType, CardFactId>> = { centrefold: "hours.peak" }

/**
 * The poster's three stats when the member has not chosen (design 6.3): the
 * hours; the percentile at top 25% or better, else the longest streak; and
 * the peak hour. A stat the page's graphic already shows, or one the member
 * does not have, gives way to the next allowed stat.
 *
 * @internal Exported for its test.
 *
 * @example
 * ```ts
 * defaultCardFacts("centrefold", (id) => id !== "standing.percentile")
 * // ["time.totalHours", "streak.longest.days", "time.seriesHours"]
 * ```
 */
export function defaultCardFacts(page: IssuePageType, allowed: (id: CardFactId) => boolean): CardFactId[] {
  const ok = (id: CardFactId) => allowed(id) && SHOWN_BY_GRAPHIC[page] !== id
  const second: CardFactId = ok("standing.percentile") ? "standing.percentile" : "streak.longest.days"
  const order: CardFactId[] = ["time.totalHours", second, "hours.peak", "streak.longest.days", ...CARD_FACT_IDS]
  return [...new Set(order)].filter(ok).slice(0, 3)
}

function archetypeOf(rewind: RewindDataV3, ctx: ShareContext): ShareSafePage["archetype"] {
  if (!rewind.archetype) return null
  const id = rewind.archetype.id
  const lineId = rewind.copy?.archetype.id === id ? rewind.copy.archetype.posterLineId : posterLineTemplate(id, ctx.userId)
  return { id, name: getArchetype(id).name, posterLine: POSTER_LINES[lineId] ?? "" }
}

/** The page's headline from its published facts only, else its title-free line. */
function cardHeadline(page: IssuePageType, allowed: RewindFactsV3, year: number): string {
  const firstTitle = allowed["bookends.first.title"]?.display
  const source = { ...allowed, ...copyLocals({ year, firstTitle }) }
  const template = headline(page, allowed)
  const complete = tokenIds(template).every((id) => source[id as keyof typeof source])
  return (complete ? renderCopyText(template, source) : titleFreeHeadline(page)).slice(0, 200)
}

interface PageInput {
  rewind: RewindDataV3
  options: ShareOptions
  ctx: ShareContext
  keys: Partial<Record<FactId, string[]>>
  hidden: Set<FactId>
}

function projectPage(type: SharePageType, { rewind, options, ctx, keys, hidden }: PageInput): ShareSafePage {
  const entry = registry[type]
  const printable = (id: FactId) => Boolean(rewind.facts[id]) && !hidden.has(id) && mayPrint(id, type, rewind.facts, ctx)
  const chosen = options.cardFacts.length > 0 ? options.cardFacts : defaultCardFacts(type, printable)
  const stats = ARCHETYPE_PAGES.has(type) ? chosen.filter(printable) : []
  const ids = [...new Set<FactId>([...entry.share.facts, ...stats])].filter(printable)
  const allowed: RewindFactsV3 = Object.fromEntries(ids.map((id) => [id, rewind.facts[id]]))
  if (options.signed && rewind.facts["member.firstName"]) allowed["member.firstName"] = rewind.facts["member.firstName"]
  const titleIds = ids.filter(isTitle).slice(0, 5)
  const art = options.includeArt && ctx.allowArt && entry.share.art ? titleIds.flatMap((id) => {
          const key = keys[id]?.at(-1)
          return key && RATING_KEY.test(key) ? [{ ratingKey: key }] : []
        }) : null

  return {
    type,
    headline: cardHeadline(type, allowed, rewind.year),
    facts: Object.fromEntries(ids.filter((id) => !isTitle(id)).map((id) => [id, { display: rewind.facts[id]!.display }])),
    titles: titleIds.map((id) => rewind.facts[id]!.display.slice(0, 200)),
    titleIds,
    art: art && art.slice(0, 4),
    soundtrack: SOUNDTRACK_PAGES.has(type) ? soundtrackOf(rewind, options.dailyDetail) : null,
    archetype: ARCHETYPE_PAGES.has(type) ? archetypeOf(rewind, ctx) : null,
    hours: hoursOf(rewind, type),
    stats,
  }
}

function ogText(year: number, ownerName: string | null, brand: string | null, first: ShareSafePage | undefined): string {
  const issue = ownerName ? `${ownerName}'s Rewind ${year}` : brand ? `${brand} Rewind ${year}` : `Rewind ${year}`
  return (first ? `${issue}: ${first.headline}` : issue).slice(0, 200)
}

/**
 * Projects a stored v3 Rewind for a card or a link.
 *
 * @throws When the projection fails its strict schema (a bug, never data).
 *
 * @example
 * ```ts
 * const shared = toShareSafe(rewind, { pages: ["top-shows"], signed: false, includeArt: false, dailyDetail: false, cardFacts: [] }, ctx)
 * shared.pages.map((p) => p.type) // ["top-shows"]
 * shared.ownerName                // null
 * ```
 */
export function toShareSafe(rewind: RewindDataV3, options: ShareOptions, ctx: ShareContext): ShareSafeRewindV3 {
  const keys = titleKeys(rewind)
  const input: PageInput = { rewind, options, ctx, keys, hidden: hiddenTitleFacts(rewind, keys, ctx) }
  const stored = new Set(rewind.pages.map((page) => page.type))
  const published = new Set(options.pages)
  const pages = (Object.keys(registry) as IssuePageType[])
    .filter((type): type is SharePageType => published.has(type as SharePageType) && stored.has(type))
    .map((type) => projectPage(type, input))
  const ownerName = options.signed ? (rewind.facts["member.firstName"]?.display.slice(0, 24) ?? null) : null
  const brand = ctx.showServerName && ctx.serverName ? ctx.serverName.slice(0, 60) : null
  const serial = rewind.facts["member.serial"]?.display

  return ShareSafeRewindV3.parse({
    version: 3,
    year: rewind.year,
    brand,
    ownerName,
    serial: serial && /^[0-9A-HJKMNP-TV-Z]{4}$/.test(serial) ? serial : null,
    edition: rewind.edition,
    window: { from: rewind.window.from, through: rewind.window.through, finalCut: rewind.window.finalCut },
    pages,
    ogText: ogText(rewind.year, ownerName, brand, pages[0]),
  })
}

export type CardSize = "story" | "og"

/** Everything a card's pixels depend on besides `CARD_VERSION`: the card cache key hashes it. */
export interface CardInput {
  page: ShareSafePage
  year: number
  serial: string | null
  edition: ShareSafeRewindV3["edition"]
  window: ShareSafeRewindV3["window"]
  factsHash: string
  size: CardSize
  signed: boolean
  ownerName: string | null
  art: ShareSafePage["art"]
  daily: boolean
  cardFacts: ShareOptions["cardFacts"]
  brand: string | null
  publicCounts: boolean
  exclusionsVersion: number
}

/**
 * The input of one card: the projected page plus everything the projection
 * depended on. Null when `page` is not published.
 */
export function cardInput(
  shared: ShareSafeRewindV3,
  page: SharePageType,
  size: CardSize,
  meta: { factsHash: string; options: ShareOptions; ctx: ShareContext }
): CardInput | null {
  const projected = shared.pages.find((p) => p.type === page)
  if (!projected) return null
  return {
    page: projected,
    year: shared.year,
    serial: shared.serial,
    edition: shared.edition,
    window: shared.window,
    factsHash: meta.factsHash,
    size,
    signed: meta.options.signed,
    ownerName: shared.ownerName,
    art: projected.art,
    daily: meta.options.dailyDetail,
    cardFacts: meta.options.cardFacts,
    brand: shared.brand,
    publicCounts: meta.ctx.publicCounts,
    exclusionsVersion: meta.ctx.exclusionsVersion,
  }
}
