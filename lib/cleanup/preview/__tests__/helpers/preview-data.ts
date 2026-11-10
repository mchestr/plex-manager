/**
 * Builders for the preview tests: a real evaluation context (the real field
 * evaluators and global protections), preview data on a list of items, and
 * drafts and requests. Every value is invented.
 *
 * @internal Test-only.
 * @module lib/cleanup/preview/__tests__/helpers/preview-data
 */

import {
  buildLiveFacts,
  buildOptions,
  buildSnapshotFacts,
  buildSourceStatuses,
  NOW,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { buildEvalContext, type EvalContextInput } from "@/lib/cleanup/engine/context"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { ParsedPreviewRequest, PreviewData } from "@/lib/cleanup/preview/compute"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type PreviewRequest, previewRequestSchema } from "@/lib/validations/cleanup-actions"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

/** @internal Two members: one with a Plex account and one former member. */
export const MEMBERS = [
  { userId: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null },
  { userId: "u-blake", plexUserId: "200", name: "Blake Example", accessEndedAt: new Date(NOW - 86_400_000) },
]

/** @internal A real `EvalContext` (TS 4.1) at `NOW` in UTC with every source ok, unless overridden. */
export function realContext(overrides: Partial<EvalContextInput> = {}): EvalContext {
  return buildEvalContext({
    now: NOW,
    zone: "UTC",
    facts: buildSnapshotFacts({
      users: { "100": { hasAccess: true, lastPlayAt: null, owner: false }, "200": { hasAccess: false, lastPlayAt: null, owner: false },
        "1": { hasAccess: true, lastPlayAt: null, owner: true } },
    }),
    sources: buildSourceStatuses(),
    shows: [],
    live: buildLiveFacts({ members: MEMBERS }),
    options: buildOptions(),
    ...overrides,
  })
}

/** @internal Preview data on `items`, with a snapshot that finished at `NOW`. */
export function previewData(items: readonly SnapshotItem[], overrides: Partial<PreviewData> = {}): PreviewData {
  const ctx = overrides.ctx ?? realContext({ shows: items.filter((i) => i.level === "show") })
  return {
    snapshot: { id: "snap-1", takenAt: new Date(NOW).toISOString(), finishedAt: NOW, sources: buildSourceStatuses(), facts: buildSnapshotFacts() },
    items,
    byKey: new Map(items.map((i) => [i.key, i])),
    ctx,
    mode: null,
    ...overrides,
  }
}

/** @internal A movie draft in library 1: the given conditions, delete with the exclusion after 30 days. */
export function buildDraft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    schemaVersion: 1,
    level: "movie",
    libraries: ["1"],
    conditions: [],
    protections: [],
    then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
    ...overrides,
  }
}

/** @internal A parsed preview request of `definition`. */
export function buildRequest(definition: RuleDraft, overrides: Partial<PreviewRequest> = {}): ParsedPreviewRequest {
  return previewRequestSchema.parse({ definition, ...overrides })
}
