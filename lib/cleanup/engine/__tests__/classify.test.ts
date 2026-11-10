/** Classify (TS 6.3): a table over every branch, in the binding step order, and one class for every combination. */

import { buildMovieItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import type { Classification, ItemClass, ItemResult, ProtectionState, Verdict } from "@/lib/cleanup/engine/types"
import type { MatchCause, MatchState } from "@/lib/cleanup/schema/snapshot"

function result(clauses: Verdict[], protections: ProtectionState[] = [], state: MatchState = "matched", cause?: MatchCause): ItemResult {
  return {
    item: buildMovieItem(),
    clauses: clauses.map((verdict, i) => ({ id: `c${i + 1}`, verdict })),
    members: {},
    protections: protections.map((verdict, i) => ({ id: `g${i + 1}`, verdict })),
    match: cause === undefined ? { state } : { state, cause },
  }
}

type Row = [string, ItemResult, Classification]

const TABLE: Row[] = [
  // Step 2: two or more failed clauses
  ["two fails", result(["fail", "fail"]), { class: "notListed" }],
  ["two fails and a protection", result(["fail", "fail", "pass"], ["protects"]), { class: "notListed" }],
  ["three fails, not matched", result(["fail", "fail", "fail"], [], "unmatched", "noArrRecord"), { class: "notListed" }],
  // Step 3.1: one fail, a protection protects
  ["one fail and a protection", result(["fail", "pass"], ["clear", "protects"]), { class: "notListed" }],
  // Step 3.2: one fail, the rest pass, every protection clear, matched
  ["one fail, the rest pass", result(["pass", "fail", "pass"], ["clear", "clear"]), { class: "nearMiss", failing: "c2" }],
  ["one fail, the only clause", result(["fail"]), { class: "nearMiss", failing: "c1" }],
  // Step 3.3: one fail and anything else unsure
  ["one fail with an unknown elsewhere", result(["fail", "unknown"]), { class: "notListed" }],
  ["one fail with an unknown protection", result(["fail", "pass"], ["unknown"]), { class: "notListed" }],
  ["one fail, match unknown", result(["fail", "pass"], [], "unknown"), { class: "notListed" }],
  ["one fail, conflicted", result(["fail", "pass"], [], "conflicted", "twoArrRecords"), { class: "notListed" }],
  ["one fail, not managed", result(["fail"], ["clear"], "notManaged"), { class: "notListed" }],
  // Step 4.1: no fail, a protection protects (it beats unknowns)
  ["a protection", result(["pass", "pass"], ["clear", "protects"]), { class: "protected" }],
  ["a protection beats an unknown clause", result(["pass", "unknown"], ["protects"]), { class: "protected" }],
  ["a protection beats an unknown protection", result(["pass"], ["unknown", "protects"]), { class: "protected" }],
  ["a protection beats an unknown match", result(["pass"], ["protects"], "unknown"), { class: "protected" }],
  ["a protection beats cannot delete", result(["pass"], ["protects"], "unmatched", "noIds"), { class: "protected" }],
  // Step 4.2: no fail, something unknown
  ["an unknown clause", result(["pass", "unknown"], ["clear"]), { class: "missing" }],
  ["an unknown protection", result(["pass", "pass"], ["clear", "unknown"]), { class: "missing" }],
  ["match unknown", result(["pass"], ["clear"], "unknown"), { class: "missing" }],
  ["an unknown clause and not matched", result(["unknown"], [], "unmatched", "noArrRecord"), { class: "missing" }],
  // Step 4.3: matched
  ["every clause passes", result(["pass", "pass"], ["clear"]), { class: "match" }],
  ["no clause and no protection", result([]), { class: "match" }],
  // Step 4.4: cannot delete with the match cause
  ["unmatched", result(["pass"], ["clear"], "unmatched", "noArrRecord"), { class: "cannotDelete", cause: "noArrRecord" }],
  ["conflicted", result(["pass"], [], "conflicted", "conflictingIds"), { class: "cannotDelete", cause: "conflictingIds" }],
  ["outside the root", result(["pass"], [], "notManaged", "outsideRoot"), { class: "cannotDelete", cause: "outsideRoot" }],
  ["season numbers differ", result(["pass"], [], "notManaged", "seasonMismatch"), { class: "cannotDelete", cause: "seasonMismatch" }],
  ["not managed with no cause", result(["pass"], [], "notManaged"), { class: "cannotDelete" }],
]

describe("classify", () => {
  it.each(TABLE)("%s", (_name, input, expected) => {
    expect(classify(input)).toEqual(expected)
  })

  it("names the failing clause by its id, also a group id", () => {
    const input = result(["pass", "fail"])
    input.clauses[1].id = "a1"
    expect(classify(input)).toEqual({ class: "nearMiss", failing: "a1" })
  })

  describe("one class for every combination", () => {
    const VERDICTS: Verdict[] = ["pass", "fail", "unknown"]
    const STATES: ProtectionState[] = ["clear", "protects", "unknown"]
    const MATCHES: MatchState[] = ["matched", "unmatched", "conflicted", "notManaged", "unknown"]
    const cases: [Verdict, Verdict, ProtectionState, MatchState][] = []
    for (const a of VERDICTS) for (const b of VERDICTS) for (const p of STATES) for (const m of MATCHES) cases.push([a, b, p, m])

    /** UX 5.3 in words, checked against the step order. */
    function expected(clauses: Verdict[], protection: ProtectionState, match: MatchState): ItemClass {
      const fails = clauses.filter((v) => v === "fail").length
      if (fails >= 2) return "notListed"
      if (fails === 1) return protection === "clear" && match === "matched" && clauses.every((v) => v !== "unknown") ? "nearMiss" : "notListed"
      if (protection === "protects") return "protected"
      if (protection === "unknown" || match === "unknown" || clauses.includes("unknown")) return "missing"
      return match === "matched" ? "match" : "cannotDelete"
    }

    it.each(cases)("%s, %s, protection %s, %s", (a, b, p, m) => {
      expect(classify(result([a, b], [p], m)).class).toBe(expected([a, b], p, m))
    })
  })
})
