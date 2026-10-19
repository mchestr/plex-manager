/**
 * The one light status a member's Rewind UI polls (RWP-20, BP-22): built from
 * status columns only, never `PlexWrapped.data`. Client-safe: the polling hook
 * and the cards import the types.
 *
 * @module
 */

import type { RewindInfraCode } from "@/lib/rewind/infra-copy"
import { readGenerationError, readStoredError, type RewindErrorCode } from "@/lib/wrapped/generation-errors"

export type RewindState = "none" | "queued" | "running" | "completed" | "failed" | "unavailable"

export interface RewindStatus {
  state: RewindState
  /** The failure's code for `failed`, the FR-50 code for `unavailable`, else null. */
  errorCode: RewindErrorCode | RewindInfraCode | null
  /** When the current run started (ISO), while one is running. */
  startedAt: string | null
  /** A completed Rewind exists, so the viewer works whatever the latest run is doing (FR-40). */
  hasCompleted: boolean
}

/** True while a run is queued or running. */
export function isActiveRewindState(state: RewindState): boolean {
  return state === "queued" || state === "running"
}

/** The FR-50 code of an `unavailable` status, or null. */
export function infraCode(code: RewindStatus["errorCode"]): RewindInfraCode | null {
  return code === "REDIS_NOT_CONFIGURED" || code === "REDIS_UNAVAILABLE" ? code : null
}

/** The failure code of a `failed` status, defaulting to `GENERATION_FAILED`. */
export function failureCode(code: RewindStatus["errorCode"]): RewindErrorCode {
  return code === null || infraCode(code) ? "GENERATION_FAILED" : (code as RewindErrorCode)
}

interface StatusRows {
  wrapped: { status: string; error: string | null } | null
  /** The newest generation that was not skipped. */
  latest: { status: string; error: unknown; startedAt: Date | null } | null
  /** Asked only when the state depends on it: no run active and nothing completed. */
  infra: () => Promise<{ ok: true } | { ok: false; code: RewindInfraCode }>
}

/**
 * Derives the status, in this order: a queued or running run, a completed
 * Rewind, Redis missing or down (FR-50), the latest failure, nothing yet. A
 * `generating` row with no generation behind it (left by the in-request
 * generation P2.17 replaced) counts as running until the stale sweep closes it.
 *
 * @example
 * ```ts
 * await deriveRewindStatus({ wrapped: null, latest: null, infra: async () => ({ ok: true }) })
 * // { state: "none", errorCode: null, startedAt: null, hasCompleted: false }
 * ```
 */
export async function deriveRewindStatus({ wrapped, latest, infra }: StatusRows): Promise<RewindStatus> {
  const hasCompleted = wrapped?.status === "completed"
  const base = { errorCode: null, startedAt: null, hasCompleted }

  if (latest?.status === "queued" || latest?.status === "running") {
    return { ...base, state: latest.status, startedAt: latest.startedAt?.toISOString() ?? null }
  }
  if (!latest && wrapped?.status === "generating") return { ...base, state: "running" }
  if (hasCompleted) return { ...base, state: "completed" }

  const check = await infra()
  if (!check.ok) return { ...base, state: "unavailable", errorCode: check.code }
  if (latest?.status === "failed") return { ...base, state: "failed", errorCode: readGenerationError(latest.error) }
  if (!latest && wrapped?.status === "failed") {
    return { ...base, state: "failed", errorCode: readStoredError(wrapped.error) }
  }
  return { ...base, state: "none" }
}
