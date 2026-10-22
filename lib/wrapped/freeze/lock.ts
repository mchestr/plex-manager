/**
 * Rewind's freeze lock (P8.1): `rewind-2026.1.lock.json`, written by
 * `npm run rewind:freeze -- --write` and compared by `--check` in CI.
 *
 * The lock holds a sha256 per section (`sections.ts`) and, in plain text, the
 * frozen model, which the runtime reads through `getFrozenRewindModel()`
 * (`lib/llm/registry.ts`). `model` is null until the bake-off's choice is in
 * `evals/rewind/selected.json`; while it is, Rewind writes with the active
 * `wrapped` provider row as before.
 *
 * ## Changing the lock
 *
 * Every write adds a dated reason line. From `frozenAt` a changed lock needs
 * a new prompt version (`rewind-2026.2`) and the owner's sign-off in the PR;
 * after the code freeze (2026-12-14) only a data or security fix qualifies.
 *
 * ## Runtime model
 *
 * ```
 * no active wrapped row ──────────────────────► null (templates)
 * lock has no model yet ──────────────────────► the row's own model (status "unfrozen")
 * row's provider is the lock's ───────────────► the lock's model on the row's key ("frozen")
 * row names another provider ─────────────────► "mismatch": the copy step writes templates
 * ```
 *
 * @module lib/wrapped/freeze/lock
 */

import { z } from "zod"

import type { LLMProviderId } from "@/lib/llm/models"
import { isLLMProviderId, LLM_PROVIDER_IDS } from "@/lib/llm/provider-presets"

import lockFile from "./rewind-2026.1.lock.json"

/** The lock's path from the repository root; the version is its file name. */
export const LOCK_PATH = "lib/wrapped/freeze/rewind-2026.1.lock.json"

const lockModelSchema = z.strictObject({
  provider: z.enum(LLM_PROVIDER_IDS),
  modelId: z.string().min(1),
  /** The repair and economy model; null where the provider has none. */
  budgetModelId: z.string().min(1).nullable(),
  effort: z.literal("low"),
  maxOutputTokens: z.number().int().positive(),
})

export type LockModel = z.infer<typeof lockModelSchema>

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const freezeLockSchema = z.strictObject({
  version: z.string().min(1),
  frozenAt: day,
  model: lockModelSchema.nullable(),
  hashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  changes: z.array(z.strictObject({ on: day, reason: z.string().min(1) })).min(1),
})

export type FreezeLock = z.infer<typeof freezeLockSchema>

/** The committed lock. */
export const REWIND_LOCK: FreezeLock = freezeLockSchema.parse(lockFile)

/** The model Rewind writes with; see the module comment. */
export type FrozenRewindModel =
  | { status: "frozen" | "unfrozen"; provider: LLMProviderId; model: string; budgetModel: string | null | undefined; rowModel: string }
  | { status: "mismatch"; provider: string; locked: LockModel }

/**
 * The runtime model for the active `wrapped` row under `lock`. An unfrozen
 * row leaves `budgetModel` undefined, so the copy step picks the provider's
 * own budget model as before.
 */
export function frozenModelFor(row: { provider: string; model: string } | null, locked: LockModel | null): FrozenRewindModel | null {
  if (!row || !isLLMProviderId(row.provider)) return null
  if (!locked) return row.model ? { status: "unfrozen", provider: row.provider, model: row.model, budgetModel: undefined, rowModel: row.model } : null
  if (row.provider !== locked.provider) return { status: "mismatch", provider: row.provider, locked }
  return { status: "frozen", provider: locked.provider, model: locked.modelId, budgetModel: locked.budgetModelId, rowModel: row.model }
}

/** `anthropic:claude-sonnet-5-5`, as the dashboard and messages name a locked model. */
export const lockedModelLabel = (locked: LockModel) => `${locked.provider}:${locked.modelId}`
