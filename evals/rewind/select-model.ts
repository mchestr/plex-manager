/**
 * The bake-off's selection rule (design 8.6, P5.13). Pure.
 *
 * ```
 * candidates ─► deterministic gates pass? ─► first-pass ≥ 98%? ─► p95 < 60 s?
 *            ─► rank: judge score (high first; unscored last) ─► cost (low first)
 * ```
 *
 * A local model (an OpenAI-compatible server) is offered as a preset when it
 * reaches 95% first-pass and 100% after repair, whether or not it wins.
 *
 * @module evals/rewind/select-model
 */

/** @internal */
export const FIRST_PASS_GATE = 0.98
const P95_LATENCY_GATE_MS = 60_000
const LOCAL_FIRST_PASS_GATE = 0.95

export interface Candidate {
  /** `<provider>:<id>` */
  model: string
  local: boolean
  /** The deterministic gates (`checks.ts`) passed with no issue. */
  gatesPassed: boolean
  firstPass: number
  afterRepair: number
  /** Mean advisory judge score, 1 to 5; null when unjudged. */
  judge: number | null
  costUsd: number
  p95LatencyMs: number
}

export interface Selection {
  /** The winner, or null when no candidate clears the gates. */
  selected: string | null
  /** Candidates that cleared every gate, best first. */
  ranked: string[]
  rejected: Array<{ model: string; reasons: string[] }>
  /** Local models good enough to offer as a preset. */
  localPresets: string[]
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function rejection(c: Candidate): string[] {
  const reasons: string[] = []
  if (!c.gatesPassed) reasons.push("deterministic gates failed")
  if (c.firstPass < FIRST_PASS_GATE) reasons.push(`first-pass grounding ${pct(c.firstPass)} is under ${pct(FIRST_PASS_GATE)}`)
  if (c.p95LatencyMs >= P95_LATENCY_GATE_MS) reasons.push(`p95 latency ${(c.p95LatencyMs / 1000).toFixed(1)} s is not under 60 s`)
  return reasons
}

function compare(a: Candidate, b: Candidate): number {
  if (a.judge !== b.judge) {
    if (a.judge === null) return 1
    if (b.judge === null) return -1
    return b.judge - a.judge
  }
  return a.costUsd - b.costUsd
}

/** Applies the selection rule; see the module comment. */
export function selectModel(candidates: readonly Candidate[]): Selection {
  const rejected = candidates.map((c) => ({ model: c.model, reasons: rejection(c) })).filter((r) => r.reasons.length > 0)
  const ranked = candidates
    .filter((c) => !rejected.some((r) => r.model === c.model))
    .sort(compare)
    .map((c) => c.model)
  const localPresets = candidates
    .filter((c) => c.local && c.gatesPassed && c.firstPass >= LOCAL_FIRST_PASS_GATE && c.afterRepair === 1)
    .map((c) => c.model)
  return { selected: ranked[0] ?? null, ranked, rejected, localPresets }
}
