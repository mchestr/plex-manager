/**
 * The rule editor of `/admin/cleanup/rules/[id]` and `/admin/cleanup/rules/new`
 * (UX 4.3, 12.2, TS 10.4): the rule with its `revision` (E25), or a recipe
 * or blank start; every field and library with why it is disabled; the
 * global protections of the level; the requester options; the options and
 * the zone that the editor's words read; and the first preview from
 * `runPreview()`. Admin only.
 *
 * The requester options and the preview rows name members, so the read
 * writes `auditMemberListed("cleanup-requesters")`, at most once per admin
 * and hour. It reads stored data only and calls no upstream service.
 *
 * @module lib/data/cleanup-editor
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { namesRequesters } from "@/lib/cleanup/preview/rows"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import { editorFields, editorGlobalProtections, editorLibraries } from "@/lib/cleanup/screens/editor/fields"
import { requesterOptions } from "@/lib/cleanup/screens/editor/requesters"
import { blankStart, type CleanupEditorInput, recipeStart } from "@/lib/cleanup/screens/editor/start"
import { setUpServices } from "@/lib/cleanup/screens/settings/feature"
import { readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import { type Mode, MODES } from "@/lib/validations/cleanup-vocabulary"

export type { CleanupEditorInput } from "@/lib/cleanup/screens/editor/start"

const RULE_SELECT = { id: true, name: true, mode: true, revision: true, definition: true, turnedOnAt: true, stats: true } as const
const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value)

const readRule = (ruleId: string) => prisma.cleanupRule.findUnique({ where: { id: ruleId }, select: RULE_SELECT })
type SavedRule = NonNullable<Awaited<ReturnType<typeof readRule>>>

/** The editor's rule part of a saved rule, or null when its definition does not parse. */
function savedRule(row: SavedRule): CleanupEditorData["rule"] | null {
  const parsed = parseRuleDefinition(row.definition)
  if (!parsed.ok) return null
  const newest = parseRuleStats(row.stats).dryRuns.at(-1)
  return {
    id: row.id, name: row.name, mode: isMode(row.mode) ? row.mode : "dryRun", revision: row.revision, definition: parsed.definition,
    turnedOnAt: row.turnedOnAt?.toISOString() ?? null, lastDryRun: newest ? { at: newest.at, matches: newest.matches } : null,
  }
}

/**
 * The editor data of a saved rule (`{ ruleId }`), a recipe start
 * (`{ recipe, values, level }`) or a blank start (`{ level }`).
 *
 * @returns null for a rule that does not exist or whose stored definition does not parse (the page shows `notFound()`)
 * @throws the `PM_UNAUTHENTICATED` or `PM_FORBIDDEN` error of `assertAdmin()`
 */
export async function getCleanupRuleEditor(input: CleanupEditorInput, now: Date = new Date()): Promise<CleanupEditorData | null> {
  const session = await assertAdmin()
  const [settings, zone, snapshot, setUp, members, row] = await Promise.all([
    readCleanupSettingsRow(), serverZone(), loadNewestSnapshot(), setUpServices(),
    prisma.user.findMany({ select: { id: true, plexUserId: true, name: true, accessEndedAt: true } }),
    "ruleId" in input ? readRule(input.ruleId) : null,
  ])
  const { options } = settings
  const libraries = snapshot?.header.facts.libraries ?? []
  let rule: CleanupEditorData["rule"] | null
  if ("ruleId" in input) rule = row ? savedRule(row) : null
  else {
    const start = "recipe" in input ? recipeStart(input, { options, libraries }) : blankStart(input.level, { options, libraries })
    rule = { id: null, name: start.name, mode: "dryRun", revision: null, definition: start.definition, turnedOnAt: null, lastDryRun: null }
  }
  if (!rule) return null

  const { level } = rule.definition
  const initialPreview = await runPreview({ definition: rule.definition, ...(rule.id ? { ruleId: rule.id } : {}) }, { actorId: session.user.id, now })
  const requesters = requesterOptions({ snapshot, members, draft: rule.definition })
  if (requesters.length > 0 || initialPreview.rows.some((r) => namesRequesters(r.requestedBy))) {
    await auditMemberListed("cleanup-requesters", session.user.id, rule.id ? { ruleId: rule.id } : {})
  }
  return {
    rule,
    fields: editorFields(level, setUp),
    libraries: editorLibraries(libraries),
    globalProtections: editorGlobalProtections(level, options),
    requesterOptions: requesters,
    options: { automaticMinGraceDays: options.automaticMinGraceDays, defaults: options.defaults },
    zone,
    initialPreview,
  }
}
