/**
 * 16 Centrefold (design 4.3, 5.3): the identity reveal as a pull-out poster.
 * Always kept. Its data is the shortlist with each archetype's evidence fact
 * ids, for "Why this?", the 24 hours for the Table, and the evidence graphic
 * of the archetype's colourway:
 *
 * | Graphic | Archetypes | Shows |
 * |---|---|---|
 * | `hour-ring` | Midnight Marathoner (arc 22-3), Golden Hour Viewer (arc 18-21) | plays by start hour |
 * | `meter` | Credits Roller, Premiere Chaser, Series Devourer, Explorer, Loyalist | the scorer's share against the server median |
 * | `calendar-dots` | Weekend Double Feature (weekends solid), Casual Critic | played days |
 * | `shelf` | Comfort Rewatcher, Curator, Festival Juror | titles as spines |
 *
 * A graphic whose fact the member lacks is left out (null), never drawn empty.
 *
 * @module lib/rewind/pages/centrefold
 */

import { copyText, figure, paragraph, plain, tableBlock, type ArticleBlock, type ArticleContext } from "@/lib/rewind/article/blocks"
import { aboutTheWords } from "@/lib/rewind/copy-disclosure"
import type { PageDefinition } from "@/lib/rewind/registry"
import { headline, slotTemplate, whyReasons } from "@/lib/wrapped/copy/templates"
import { ARCHETYPE_STYLE, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { scoreArchetypes } from "@/lib/wrapped/archetypes/scorers"
import { selectArchetype } from "@/lib/wrapped/archetypes/select"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

import { CentrefoldDataSchema, type CentrefoldData, type EvidenceGraphic } from "./centrefold.schema"
import { hoursTable, ringSummary } from "./clock"
import { has, num, shown } from "./facts"

/** Rarity prints only with 10 or more scored members (D13). */
const RARITY_MEMBERS = 10
/** Each shortlisted archetype's standing in "Why this?". */
export const STANDING = ["Your archetype", "Close second", "Also in the running"]

/** "Midnight Marathoner": the name after "You are the". */
export const nameAfterLead = (name: string) => name.replace(/^The\s+/, "")

/** The rarity stamp shows with 10 or more scored members. */
export const showsRarity = (facts: RewindFactsV3) => num(facts, "archetype.scoredMembers") >= RARITY_MEMBERS && has(facts, "archetype.rarityCount")

const SHORTLIST = 3
const EVIDENCE = 4
const SPINES = 6
const ONE_TO_FIVE = [1, 2, 3, 4, 5] as const

type MeterSpec = { fact: FactId; scale?: (value: number) => number; median?: FactId }

/** The meter's fact per archetype; counts take a scale so the bar reads against something. */
const METERS: Partial<Record<ArchetypeId, MeterSpec>> = {
  "credits-roller": { fact: "records.completionShare", median: "records.completionShare.median" },
  "premiere-chaser": { fact: "taste.freshShare" },
  "series-devourer": { fact: "records.deepestBinge.episodes", median: "records.deepestBinge.median", scale: (v) => Math.max(v, 10) },
  explorer: { fact: "counts.titlesPer10Hours", scale: (v) => Math.max(v, 10) },
  loyalist: { fact: "series.top3Share" },
}

/** What a meter's number counts, after the number: "94% of what you started, finished". */
export const METER_CAPTION: Partial<Record<FactId, string>> = {
  "records.completionShare": "of what you started, finished",
  "taste.freshShare": "of your plays within two weeks of a release",
  "records.deepestBinge.episodes": "episodes in your deepest binge",
  "counts.titlesPer10Hours": "new titles for every ten hours",
  "series.top3Share": "of your series time on your top three",
}

const RINGS: Partial<Record<ArchetypeId, { arc: { from: number; to: number }; share: FactId }>> = {
  "midnight-marathoner": { arc: { from: 22, to: 3 }, share: "hours.afterDarkShare" },
  "golden-hour-viewer": { arc: { from: 18, to: 21 }, share: "hours.goldenShare" },
}

function meterGraphic(spec: MeterSpec, facts: RewindFactsV3): EvidenceGraphic | null {
  if (!has(facts, spec.fact)) return null
  const value = num(facts, spec.fact)
  const scale = spec.scale?.(Math.max(value, spec.median ? num(facts, spec.median) * 2 : 0)) ?? 1
  const median = spec.median && has(facts, spec.median) ? Math.min(1, num(facts, spec.median) / scale) : null
  return { kind: "meter", fact: spec.fact, ratio: Math.min(1, value / scale), median }
}

/** The spines: rewatched titles for the Comfort Rewatcher, films for the Festival Juror, else the top titles. */
function shelfGraphic(id: ArchetypeId, facts: RewindFactsV3): EvidenceGraphic | null {
  const films = ONE_TO_FIVE.filter((n) => has(facts, `films[${n}].title`)).map((n) => ({
    title: `films[${n}].title` as FactId,
    mark: num(facts, `films[${n}].plays`) >= 2 ? (`films[${n}].plays` as FactId) : null,
  }))
  const series = ONE_TO_FIVE.filter((n) => has(facts, `series[${n}].title`)).map((n) => ({
    title: `series[${n}].title` as FactId,
    mark: num(facts, `series[${n}].rewatched`) >= 2 ? (`series[${n}].rewatched` as FactId) : null,
  }))
  const mixed = series.flatMap((s, i) => [s, ...(films[i] ? [films[i]] : [])]).concat(films.slice(series.length))
  const rewatched = mixed.filter((spine) => spine.mark !== null)
  const pick = id === "festival-juror" ? films : id === "comfort-rewatcher" && rewatched.length > 0 ? rewatched : mixed
  const spines = pick.slice(0, SPINES)
  return spines.length > 0 ? { kind: "shelf", spines } : null
}

function evidenceGraphic(id: ArchetypeId, facts: RewindFactsV3, stats: MemberStats): EvidenceGraphic | null {
  switch (ARCHETYPE_STYLE[id].graphic) {
    case "hour-ring": {
      const ring = RINGS[id]!
      return stats.time.peak !== null && has(facts, ring.share) ? { kind: "hour-ring", ...ring } : null
    }
    case "meter":
      return meterGraphic(METERS[id]!, facts)
    case "calendar-dots":
      return { kind: "calendar-dots", weekends: id === "weekend-double-feature", minutes: stats.calendar.minutes.map((d) => d.minutes) }
    case "shelf":
      return shelfGraphic(id, facts)
  }
}

/** The chosen archetype first, then the rest of code's shortlist, each with the evidence facts the member has. */
function shortlist(id: ArchetypeId, facts: RewindFactsV3, stats: MemberStats): CentrefoldData["shortlist"] {
  const scores = scoreArchetypes(stats)
  const ranked = selectArchetype(stats, { userId: "", year: 0, counts: null })?.shortlist.map((s) => s.id) ?? []
  return [id, ...ranked.filter((other) => other !== id)].slice(0, SHORTLIST).map((other) => ({
    id: other,
    evidence: scores[other].evidence.filter((fact) => has(facts, fact)).slice(0, EVIDENCE),
  }))
}

/** The graphic's text alternative, from its facts. */
export function graphicSummary(graphic: EvidenceGraphic | null, facts: RewindFactsV3): string {
  if (!graphic) return ""
  switch (graphic.kind) {
    case "hour-ring":
      return ringSummary(facts, graphic.share)
    case "meter":
      return `${shown(facts, graphic.fact)} ${METER_CAPTION[graphic.fact] ?? ""}${graphic.median === null ? "" : `, against the server's median of ${shown(facts, `${graphic.fact}.median` as FactId)}`}.`
    case "calendar-dots":
      return `You pressed play on ${shown(facts, "days.active")} of ${shown(facts, "window.elapsedDays")}${graphic.weekends ? `, ${shown(facts, "days.weekendShare")} of it at the weekend` : ""}.`
    case "shelf":
      return `On the shelf: ${graphic.spines.map((spine) => shown(facts, spine.title)).join(", ")}.`
  }
}

/** The reveal, the tagline, the graphic's summary, the foot, "Why this?" with its disclosure, and the 24 hours. */
function centrefoldArticle(data: CentrefoldData, facts: RewindFactsV3, ctx: ArticleContext): ArticleBlock[] {
  const name = shown(facts, "archetype.name")
  const template = (slot: "archetype.tagline" | "archetype.dedication") => slotTemplate(slot, { facts, userId: ctx.userId })
  const reveal: ArticleBlock = name
    ? { kind: "heading", text: [{ kind: "text", text: `${headline("centrefold", facts)} ` }, { kind: "token", id: "archetype.name", text: nameAfterLead(name) }] }
    : { kind: "heading", text: plain("You are a viewer of your own kind") }
  const blocks: ArticleBlock[] = [reveal]
  if (name) blocks.push(paragraph(`\u201C${ctx.copy?.archetype.tagline ?? template("archetype.tagline")}\u201D`, facts))
  blocks.push(...figure(graphicSummary(data.graphic, facts)))
  if (showsRarity(facts)) {
    blocks.push({ kind: "factRow", items: [{ value: `${shown(facts, "archetype.rarityCount")} of ${shown(facts, "archetype.scoredMembers")}`, label: "Rewinds here" }] })
  }
  if (has(facts, "archetype.runnerUp")) blocks.push({ kind: "definitionList", entries: [{ term: "Close second", detail: plain(shown(facts, "archetype.runnerUp")) }] })
  if (data.shortlist.length > 0) {
    blocks.push(
      {
        kind: "definitionList",
        label: `Why ${name}?`,
        entries: whyReasons(data.shortlist).map((candidate, i) => ({
          term: `${candidate.name}, ${STANDING[i].toLowerCase()}`,
          detail: copyText(candidate.reasons.join(" "), facts),
        })),
      },
      paragraph(ctx.copy?.archetype.dedication ?? template("archetype.dedication"), facts),
      { kind: "note", text: plain(aboutTheWords({ copySource: ctx.copySource, model: ctx.model })) }
    )
  }
  return [...blocks, ...tableBlock(centrefoldPage.table?.(data, facts, ctx))]
}

export const centrefoldPage: PageDefinition<CentrefoldData> = {
  select: (facts, { archetype, stats }) => ({
    shortlist: archetype ? shortlist(archetype, facts, stats) : [],
    hours: [...stats.time.histogram],
    graphic: archetype ? evidenceGraphic(archetype, facts, stats) : null,
  }),
  schema: CentrefoldDataSchema,
  srSummary: (data, facts) => {
    const name = shown(facts, "archetype.name")
    return [name ? `You are ${name.replace(/^The /, "the ")}.` : "You are a viewer of your own kind.", graphicSummary(data.graphic, facts)].filter(Boolean).join(" ")
  },
  table: (data, facts, settings) => (data.hours.some((n) => n > 0) ? hoursTable(data.hours, facts, settings) : null),
  article: centrefoldArticle,
  share: { facts: ["archetype.name", "archetype.rarityShare", "archetype.evidence[1]", "archetype.evidence[2]", "archetype.evidence[3]", "tz.label"] },
}
