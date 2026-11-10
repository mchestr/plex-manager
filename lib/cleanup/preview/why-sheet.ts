/**
 * `getWhySheet(input)`: the data of the Why Sheet (TS 6.9, 10.5) for
 * `getCleanupItemWhy`. Server-only.
 *
 * 1. With `outcomeId` (History): the stored `WhySnapshot` of that outcome,
 *    read only, with `fromRun`. The outcome must be of `itemKey`.
 * 2. Else live, from the newest snapshot: the draft when one is sent (the
 *    editor), else the stored rule `ruleId`, else the first live rule that
 *    holds the title. The draft is evaluated as the preview evaluates it.
 *
 * Null when the title, the outcome or a rule to evaluate is not found.
 *
 * @module lib/cleanup/preview/why-sheet
 */

import "server-only"

import type { z } from "zod"

import { compileDefinition, compileDraft } from "@/lib/cleanup/engine/compile"
import { applicableDraft, memberWords, ruleRequesterIds } from "@/lib/cleanup/preview/draft"
import { loadContext, loadLevel } from "@/lib/cleanup/preview/load"
import { readRule, readRules } from "@/lib/cleanup/preview/rules"
import { liveWhy } from "@/lib/cleanup/preview/why-live"
import { readArrBase, readMemberWords, readOutcome, readShowFloor, readWhyRow } from "@/lib/cleanup/preview/why-load"
import { storedWhy } from "@/lib/cleanup/preview/why-stored"
import { ruleSources } from "@/lib/cleanup/rule-blocks"
import { parseWhy } from "@/lib/cleanup/schema/why"
import { readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import type { itemWhyInput } from "@/lib/validations/cleanup-actions"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

export type WhySheetInput = z.output<typeof itemWhyInput>

const levelOf = (value: string): Level | null => LEVELS.find((level) => level === value) ?? null

async function storedSheet(input: WhySheetInput & { outcomeId: string }): Promise<WhySheetData | null> {
  const outcome = await readOutcome(input.outcomeId)
  const level = outcome ? levelOf(outcome.level) : null
  const why = outcome ? parseWhy(outcome.why) : null
  if (!outcome || !level || !why || outcome.itemKey !== input.itemKey) return null
  const [rule, settings, zone] = await Promise.all([readRule(why.ruleId), readCleanupSettingsRow(), serverZone()])
  const definition = rule?.definition ?? null
  const words = await readMemberWords(definition ? ruleRequesterIds(definition) : [])
  const { itemKey, title, year, seasonNumber, sectionId, ratingKey } = outcome
  const ref = { itemKey, level, title, year, seasonNumber, episodeCount: null, seasonCount: null, posterKey: ratingKey, sectionId,
    sizeBytes: String(outcome.sizeBytes) }
  return storedWhy({ outcome: { ref, kind: outcome.kind, runId: outcome.runId }, why, definition, protections: settings.options.protections, words, zone })
}

async function liveSheet(input: WhySheetInput, now: Date): Promise<WhySheetData | null> {
  const level = levelOf(input.itemKey.split(":", 1)[0])
  if (!level) return null
  const [data, row, rules] = await Promise.all([loadLevel(level), readWhyRow(input.itemKey), readRules()])
  const item = data?.byKey.get(input.itemKey)
  if (!data || !item) return null
  const saved = rules.find((r) => (input.ruleId ? r.id === input.ruleId : r.mode !== "dryRun" && row?.ruleIds.includes(r.id))) ?? null
  const draft = input.definition ?? saved?.definition
  if (!draft || draft.level !== level) return null
  const [{ ctx, holdUntil, paused }, showFloor, arrBase] = await Promise.all([
    loadContext(data.header, data.shows, now),
    level === "show" ? readShowFloor(item.titleKey, row?.leaveOn ?? null) : null,
    item.arr ? readArrBase(item.arr.service) : null,
  ])
  const compiled = compileDraft(applicableDraft(draft).draft)
  const used = new Set(ruleSources(compiled, ctx.options, data.header.sources))
  return liveWhy({
    item,
    compiled,
    rule: saved ? { id: saved.id, mode: saved.mode } : null,
    editor: input.definition !== undefined,
    ctx,
    items: data.items,
    sources: data.header.sources.filter((s) => used.has(s.service)),
    words: memberWords(ctx.live),
    links: { machineId: data.header.facts.machineIdentifier, arrBase },
    row,
    status: { paused, holdUntil },
    showFloor,
    others: rules
      .filter((r) => r.id !== saved?.id && r.definition.level === level)
      .map((r) => ({ id: r.id, name: r.name, mode: r.mode, compiled: compileDefinition(r.definition) })),
  })
}

/** The Why Sheet of one title, or null when it cannot be built. */
export function getWhySheet(input: WhySheetInput, { now = new Date() }: { now?: Date } = {}): Promise<WhySheetData | null> {
  const { outcomeId } = input
  return outcomeId === undefined ? liveSheet(input, now) : storedSheet({ ...input, outcomeId })
}
