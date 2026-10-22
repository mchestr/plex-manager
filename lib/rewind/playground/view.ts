/**
 * What the playground shows for a finished dry run (P8.8): the pipeline's
 * trail (P7.10) read back into plain rows the panes render, and for a
 * member, how the run differs from their stored Rewind.
 *
 * ```
 * CompletedDryRun ─► playgroundView ─► facts, selection, raw output,
 *                                      copy (segments + issues), cost
 * stored v3 row   ─► diffAgainstStored ─► pages added/removed, changed slots
 * ```
 *
 * The trail is stored as untyped JSON, so it is parsed again here; a trail
 * that no longer parses (an older shape) shows as unreadable, never as a
 * crash. Copy is rendered with `renderCopy` against the run's own facts and
 * the template-only `copy.*` values, so a token always shows the display its
 * fact id names.
 *
 * @module lib/rewind/playground/view
 */

import "server-only"

import { z } from "zod"

import type { CompletedDryRun } from "@/lib/rewind/dry-run/store"
import { issuePages, registry } from "@/lib/rewind/registry"
import { renderCopy, renderCopyText, type CopySegment, type TokenSource } from "@/lib/wrapped/copy/render-copy"
import { copyLocals } from "@/lib/wrapped/copy/templates"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { textSlots, wireText, type TextSlotId } from "@/lib/wrapped/pipeline/copy-draft"

const Issue = z.object({ rule: z.number(), slot: z.string(), message: z.string(), hint: z.string() })

const TrailSchema = z.object({
  factSheet: z.object({ facts: z.array(z.object({ id: z.string(), display: z.string() })), titles: z.array(z.string()) }),
  pages: z.array(z.string()),
  omitted: z.array(z.object({ folio: z.number().int(), reason: z.string() })),
  copy: z.object({
    path: z.string(),
    reason: z.string().optional(),
    raw: z.unknown(),
    issues: z.record(z.string(), z.array(Issue).optional()),
    repaired: z.array(z.string()),
    fallbacks: z.array(z.string()),
    calls: z.number(),
    costUsd: z.number(),
  }),
})

export type PlaygroundIssue = z.infer<typeof Issue>

/** How a slot's text was settled: the first call, a repair call, or a template after grounding failed. */
export type SlotOutcome = "kept" | "repaired" | "fallback"

export interface PlaygroundSlot {
  slot: TextSlotId
  text: string
  segments: CopySegment[]
  outcome: SlotOutcome
  issues: PlaygroundIssue[]
}

export interface PlaygroundView {
  previewId: string
  year: number
  edition: RewindDataV3["edition"]
  archetype: string | null
  facts: Array<{ id: string; display: string }>
  titles: string[]
  pages: Array<{ type: string; name: string }>
  omitted: Array<{ folio: number; type: string; name: string; reason: string }>
  /** The model's answer as it arrived, pretty-printed; null when no model ran. */
  raw: string | null
  copy: PlaygroundSlot[]
  /** Issues on slots that are not printed (the archetype pick). */
  otherIssues: PlaygroundIssue[]
  usage: { path: string; reason: string | null; model: string | null; copySource: RewindDataV3["copySource"]; calls: number; costUsd: number }
}

const REASONS: Readonly<Record<string, string>> = { PAGE_RULE: "Its page rule found too little to say" }

/** The text slots of the run's pages as the member reads them: plain text, for the diff. */
function renderedSlots(data: RewindDataV3): Map<TextSlotId, string> {
  const source: TokenSource = { ...data.facts, ...copyLocals({ year: data.year }) }
  const slots = new Map<TextSlotId, string>()
  if (!data.copy) return slots
  for (const id of textSlots(data.pages.map((p) => p.type))) {
    const text = wireText(data.copy, id)
    if (text) slots.set(id, renderCopyText(text, source))
  }
  return slots
}

/** The view of a completed run, or null when its trail no longer parses. */
export function playgroundView(previewId: string, run: CompletedDryRun): PlaygroundView | null {
  const parsed = TrailSchema.safeParse(run.trail)
  if (!parsed.success) return null
  const trail = parsed.data
  const { data } = run
  const source: TokenSource = { ...data.facts, ...copyLocals({ year: data.year }) }
  const repaired = new Set(trail.copy.repaired)
  const fallbacks = new Set(trail.copy.fallbacks)
  const issuesFor = (slot: string) => trail.copy.issues[slot] ?? []
  const slots = data.copy ? textSlots(data.pages.map((p) => p.type)) : []
  const copy = slots.flatMap((slot): PlaygroundSlot[] => {
    const text = data.copy ? wireText(data.copy, slot) : null
    if (!text) return []
    const outcome: SlotOutcome = fallbacks.has(slot) ? "fallback" : repaired.has(slot) ? "repaired" : "kept"
    return [{ slot, text, segments: renderCopy(text, source), outcome, issues: issuesFor(slot) }]
  })
  const shown = new Set<string>(copy.map((c) => c.slot))
  const otherIssues = Object.entries(trail.copy.issues).flatMap(([slot, list]) => (shown.has(slot) ? [] : (list ?? [])))

  return {
    previewId,
    year: data.year,
    edition: data.edition,
    archetype: data.archetype?.id ?? null,
    facts: trail.factSheet.facts,
    titles: trail.factSheet.titles,
    pages: data.pages.map((p) => ({ type: p.type, name: registry[p.type].name })),
    omitted: trail.omitted.map(({ folio, reason }) => {
      const page = issuePages[folio - 1]
      return { folio, type: page?.type ?? "unknown", name: page?.name ?? `Page ${folio}`, reason: REASONS[reason] ?? reason }
    }),
    raw: trail.copy.raw === null || trail.copy.raw === undefined ? null : JSON.stringify(trail.copy.raw, null, 2),
    copy,
    otherIssues,
    usage: {
      path: trail.copy.path,
      reason: trail.copy.reason ?? null,
      model: data.copyMeta.model,
      copySource: data.copySource,
      calls: trail.copy.calls,
      costUsd: trail.copy.costUsd,
    },
  }
}

export interface StoredDiff {
  pagesAdded: string[]
  pagesRemoved: string[]
  factsChanged: boolean
  slots: Array<{ slot: TextSlotId; before: string | null; after: string | null }>
}

/** How the run differs from the member's stored v3 Rewind; every slot whose rendered text changed. */
export function diffAgainstStored(run: RewindDataV3, stored: RewindDataV3): StoredDiff {
  const before = new Set(stored.pages.map((p) => p.type))
  const after = new Set(run.pages.map((p) => p.type))
  const oldSlots = renderedSlots(stored)
  const newSlots = renderedSlots(run)
  const ids = [...new Set([...oldSlots.keys(), ...newSlots.keys()])]
  return {
    pagesAdded: [...after].filter((type) => !before.has(type)),
    pagesRemoved: [...before].filter((type) => !after.has(type)),
    factsChanged: run.factsHash !== stored.factsHash,
    slots: ids.flatMap((slot) => {
      const a = oldSlots.get(slot) ?? null
      const b = newSlots.get(slot) ?? null
      return a === b ? [] : [{ slot, before: a, after: b }]
    }),
  }
}
