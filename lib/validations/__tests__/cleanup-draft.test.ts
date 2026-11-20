/** The editor draft (TS 3.2): incomplete values, the save normalisation and the stored-definition parse. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { normaliseForSave, parseRuleDefinition, type RuleDraft, ruleDraftSchema } from "@/lib/validations/cleanup-draft"

const draft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({ ...buildDefinition(), ...overrides })

describe("ruleDraftSchema", () => {
  it("accepts a draft with incomplete values, no library and no condition", () => {
    const parsed = ruleDraftSchema.safeParse({
      schemaVersion: 1,
      level: "movie",
      libraries: [],
      conditions: [{ id: "c1", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: "" } } }, { id: "a1", kind: "anyOf", conditions: [] }],
      protections: [{ id: "p1", field: "watch.plays", op: "", value: null }],
      then: {},
    })
    expect(parsed.success).toBe(true)
  })

  it("still checks ids, fields, levels and the limits", () => {
    const base = draft()
    expect(ruleDraftSchema.safeParse({ ...base, conditions: [{ id: "x1", field: "watch.plays", op: "is", value: 1 }] }).success).toBe(false)
    expect(ruleDraftSchema.safeParse({ ...base, conditions: [{ id: "c1", field: "watch.rating", op: "is", value: 1 }] }).success).toBe(false)
    expect(ruleDraftSchema.safeParse({ ...base, conditions: [{ id: "c1", field: "watch.plays", op: "x".repeat(21), value: 1 }] }).success).toBe(false)
    expect(ruleDraftSchema.safeParse({ ...base, level: "episode" }).success).toBe(false)
    expect(ruleDraftSchema.safeParse({ ...base, libraries: Array.from({ length: 21 }, (_, i) => String(i)) }).success).toBe(false)
    expect(ruleDraftSchema.safeParse({ ...base, then: { graceDays: 0 } }).success).toBe(false)
  })
})

describe("normaliseForSave", () => {
  it("saves a valid draft as it is", () => {
    const result = normaliseForSave(draft())
    expect(result).toEqual({ success: true, data: buildDefinition() })
  })

  it("turns a group with one condition into that condition, in its place, with its own id", () => {
    const lone = buildCondition("file.size", { id: "c4" })
    const result = normaliseForSave(draft({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [lone] }] }))
    expect(result.success && result.data.conditions).toEqual([buildCondition("watch.lastPlayed"), lone])
  })

  it("keeps a group of two", () => {
    const group = { id: "a1", kind: "anyOf" as const, conditions: [buildCondition("file.size", { id: "c2" }), buildCondition("library.added", { id: "c3" })] }
    const result = normaliseForSave(draft({ conditions: [group] }))
    expect(result.success && result.data.conditions).toEqual([group])
  })

  it("turns the import list exclusion off for an unmonitor action", () => {
    const result = normaliseForSave(draft({ then: { graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: true } }))
    expect(result.success && result.data.then).toEqual({ graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: false })
  })

  it("keys a bad value by its condition id, with the duration code", () => {
    const result = normaliseForSave(draft({ conditions: [{ id: "c3", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 11, unit: "years" }, orNever: true } }] }))
    expect(result).toEqual({
      success: false,
      issues: [{ key: "c3", code: "duration_range", path: "conditions.0.value.duration", message: "duration_range" }],
    })
  })

  it("keys an incomplete condition, a group member and a protection by their ids", () => {
    const result = normaliseForSave(
      draft({
        conditions: [
          { id: "c1", field: "watch.plays", op: "fewerThan", value: {} },
          { id: "a1", kind: "anyOf", conditions: [buildCondition("file.size", { id: "c2" }), { id: "c3", field: "library.added", op: "moreThan", value: null }] },
        ],
        protections: [{ id: "p1", field: "show.status", op: "is", value: { status: "gone" } }],
      })
    )
    expect(result.success).toBe(false)
    const keys = result.success ? [] : [...new Set(result.issues.map((issue) => issue.key))]
    expect(keys).toEqual(["c1", "c3", "p1"])
  })

  it("keys a group with no condition by the group id", () => {
    const result = normaliseForSave(draft({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [] }] }))
    expect(result.success ? [] : result.issues.map((issue) => [issue.key, issue.code])).toEqual([["a1", "too_small"]])
  })

  it("keys a missing Then value and an empty library list by field name", () => {
    const result = normaliseForSave(draft({ libraries: [], then: { action: "movie.delete" } }))
    expect(result.success ? [] : result.issues.map((issue) => [issue.key, issue.code])).toEqual([
      ["libraries", "too_small"],
      ["then.graceDays", "invalid_type"],
      ["then.importListExclusion", "invalid_type"],
    ])
  })

  it("keys a draft with no condition by the field name", () => {
    const result = normaliseForSave(draft({ conditions: [] }))
    expect(result.success ? [] : result.issues.map((issue) => issue.key)).toEqual(["conditions"])
  })

  it("gives the checkDefinition codes with the condition id", () => {
    const result = normaliseForSave(draft({ conditions: [buildCondition("show.status", { id: "c7" })] }))
    expect(result.success ? [] : result.issues).toEqual([{ key: "c7", code: "not_applicable", path: "conditions.0", message: "not_applicable" }])
    const action = normaliseForSave(draft({ then: { graceDays: 30, action: "show.delete", importListExclusion: true } }))
    expect(action.success ? [] : action.issues).toEqual([{ key: "then.action", code: "action_level", path: "then.action", message: "action_level" }])
  })

  it("keys a top-level issue by its field name", () => {
    const result = normaliseForSave({ ...draft(), schemaVersion: 2 } as unknown as RuleDraft)
    expect(result.success ? [] : result.issues.map((issue) => [issue.key, issue.code])).toEqual([["schemaVersion", "invalid_value"]])
  })
})

describe("parseRuleDefinition", () => {
  it("parses a stored definition", () => {
    expect(parseRuleDefinition(buildDefinition())).toEqual({ ok: true, definition: buildDefinition() })
  })

  it.each([
    [null],
    [undefined],
    ["{}"],
    [[]],
    [{ ...buildDefinition(), level: "episode" }],
    [{ ...buildDefinition(), conditions: [buildCondition("show.status")] }],
    [{ ...buildDefinition(), conditions: [{ id: "c1", field: "bogus", op: "is", value: {} }] }],
    [{ ...buildDefinition(), conditions: [{ id: "a1", kind: "anyOf", conditions: [{ field: "watch.plays" }, 5] }] }],
    [{ ...buildDefinition(), conditions: [5, null, "x"], protections: [{ id: "p1", field: "bogus" }] }],
  ])(
    "never throws, and gives issue paths only for %j",
    (raw) => {
      const parsed = parseRuleDefinition(raw)
      expect(parsed.ok).toBe(false)
      expect(parsed.ok ? [] : parsed.paths.length).toBeGreaterThan(0)
    }
  )

  it("names paths, never the stored values", () => {
    const parsed = parseRuleDefinition({ ...buildDefinition(), libraries: ["Secret Library"] })
    expect(parsed).toEqual({ ok: false, paths: ["libraries.0"] })
  })
})
