/**
 * Kleene's three-valued logic over `Verdict` (TS 6.2). Unknown never passes a
 * condition and never clears a protection (UX 5.3 rule 1).
 *
 * | `and`   | pass    | fail | unknown |
 * |---------|---------|------|---------|
 * | pass    | pass    | fail | unknown |
 * | fail    | fail    | fail | fail    |
 * | unknown | unknown | fail | unknown |
 *
 * `or` is the dual: pass dominates, then unknown, then fail. A group's verdict
 * is `any()` of its conditions. A rule's condition verdict is `all()` of its
 * clauses.
 *
 * @module lib/cleanup/engine/kleene
 */

import type { Verdict } from "@/lib/cleanup/engine/types"

export function and(a: Verdict, b: Verdict): Verdict {
  if (a === "fail" || b === "fail") return "fail"
  if (a === "unknown" || b === "unknown") return "unknown"
  return "pass"
}

export function or(a: Verdict, b: Verdict): Verdict {
  if (a === "pass" || b === "pass") return "pass"
  if (a === "unknown" || b === "unknown") return "unknown"
  return "fail"
}

export function not(a: Verdict): Verdict {
  if (a === "pass") return "fail"
  if (a === "fail") return "pass"
  return "unknown"
}

/** Every verdict passes. The empty set passes. */
export function all(verdicts: Iterable<Verdict>): Verdict {
  let result: Verdict = "pass"
  for (const verdict of verdicts) result = and(result, verdict)
  return result
}

/** Some verdict passes. The empty set fails. */
export function any(verdicts: Iterable<Verdict>): Verdict {
  let result: Verdict = "fail"
  for (const verdict of verdicts) result = or(result, verdict)
  return result
}

/** No verdict passes. The empty set passes. */
export function none(verdicts: Iterable<Verdict>): Verdict {
  return not(any(verdicts))
}
