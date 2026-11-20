/** The stored rule model (TS 3.2): every field's values, the duration limits per unit (X4) and each checkDefinition code. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  CHECK_CODES,
  conditionIdSchema,
  conditionSchema,
  durationDays,
  durationSchema,
  groupIdSchema,
  groupSchema,
  requesterRefSchema,
  RULE_SCHEMA_VERSION,
  ruleDefinitionSchema,
  thenSchema,
} from "@/lib/validations/cleanup-rule"
import {
  ACTION_CARE,
  ACTION_IDS,
  ACTIONS,
  FIELD_IDS,
  FIELD_LEVELS,
  FIELD_NEEDS,
  FIELD_SOURCES,
  GiB,
  LEVEL_ARR,
  LEVELS,
  MODES,
  SERVICES,
  TiB,
  UNIT_DAYS,
  UNIT_MAX,
} from "@/lib/validations/cleanup-vocabulary"

const days = (amount: number, unit: "days" | "weeks" | "months" | "years" = "days") => ({ amount, unit })

describe("vocabulary (TS 3.2, TS 4.2, D3)", () => {
  it("holds the levels, modes, actions and services", () => {
    expect(LEVELS).toEqual(["movie", "show", "season"])
    expect(MODES).toEqual(["dryRun", "reviewFirst", "automatic"])
    expect(ACTIONS).toEqual({ movie: ["movie.delete", "movie.unmonitorDeleteFiles"], show: ["show.delete", "show.unmonitorDeleteFiles"], season: ["season.unmonitorDeleteFiles"] })
    expect(ACTION_IDS).toEqual(["movie.delete", "movie.unmonitorDeleteFiles", "show.delete", "show.unmonitorDeleteFiles", "season.unmonitorDeleteFiles"])
    expect(ACTION_IDS.map((id) => ACTION_CARE[id])).toEqual([1, 2, 1, 2, 2])
    expect(SERVICES).toEqual(["plex", "tautulli", "overseerr", "radarr", "sonarr"])
    expect(LEVEL_ARR).toEqual({ movie: "radarr", show: "sonarr", season: "sonarr" })
    expect(UNIT_DAYS).toEqual({ days: 1, weeks: 7, months: 30, years: 365 })
    expect([GiB, TiB]).toEqual([1073741824, 1099511627776])
  })

  it("gives each field its levels (TS 4.2)", () => {
    const showLevels = ["show", "season"]
    expect(FIELD_IDS.filter((id) => FIELD_LEVELS[id].length === 3)).toEqual(FIELD_IDS.slice(0, 8))
    expect([FIELD_LEVELS["show.status"], FIELD_LEVELS["show.lastEpisodeAdded"], FIELD_LEVELS["show.seasonsOnDisk"]]).toEqual([showLevels, showLevels, showLevels])
    expect(FIELD_LEVELS["season.position"]).toEqual(["season"])
  })

  it("gives each field its sources by level, and none for a level it does not apply to", () => {
    expect(FIELD_SOURCES["library.added"]).toEqual({ movie: ["plex", "radarr"], show: ["plex", "sonarr"], season: ["plex", "sonarr"] })
    expect(FIELD_SOURCES["file.size"]).toEqual({ movie: ["radarr", "plex"], show: ["sonarr", "plex"], season: ["sonarr", "plex"] })
    expect(FIELD_SOURCES["request.by"].movie).toEqual(["overseerr", "plex"])
    expect(FIELD_SOURCES["request.requesters"].season).toEqual(["overseerr", "tautulli"])
    expect(FIELD_SOURCES["show.lastEpisodeAdded"]).toEqual({ movie: [], show: ["plex"], season: ["plex"] })
    expect(FIELD_SOURCES["season.position"]).toEqual({ movie: [], show: [], season: ["sonarr"] })
    for (const id of FIELD_IDS) {
      for (const level of LEVELS) expect(FIELD_SOURCES[id][level].length > 0).toBe(FIELD_LEVELS[id].includes(level))
    }
  })

  it("gives each field the services it needs (TS 4.2)", () => {
    expect(FIELD_IDS.filter((id) => FIELD_NEEDS[id].length === 0)).toEqual(["library.added", "file.size", "show.lastEpisodeAdded"])
    expect(FIELD_NEEDS["request.requesters"]).toEqual(["overseerr", "tautulli"])
    expect(FIELD_NEEDS["season.position"]).toEqual(["sonarr"])
    expect(FIELD_NEEDS["watch.plays"]).toEqual(["tautulli"])
  })
})

describe("durationSchema (X4)", () => {
  it.each([
    ["days", 3650],
    ["weeks", 521],
    ["months", 121],
    ["years", 10],
  ] as const)("accepts 1 to %s %i, and refuses one more", (unit, max) => {
    expect(UNIT_MAX[unit]).toBe(max)
    expect(durationSchema.safeParse(days(1, unit)).success).toBe(true)
    expect(durationSchema.safeParse(days(max, unit)).success).toBe(true)
    const over = durationSchema.safeParse(days(max + 1, unit))
    expect(over.success).toBe(false)
    expect(over.error?.issues[0]?.message).toBe("duration_range")
  })

  it.each([
    [{ amount: 0, unit: "days" }],
    [{ amount: 1.5, unit: "days" }],
    [{ amount: 3, unit: "hours" }],
    [{ amount: 3 }],
    ["365 days"],
  ])("refuses %j", (value) => {
    expect(durationSchema.safeParse(value).success).toBe(false)
  })

  it("counts months as 30 days and years as 365", () => {
    expect(durationDays(days(3))).toBe(3)
    expect(durationDays(days(2, "weeks"))).toBe(14)
    expect(durationDays(days(6, "months"))).toBe(180)
    expect(durationDays(days(2, "years"))).toBe(730)
  })
})

describe("requesterRefSchema", () => {
  it.each([[{ kind: "anyMember" }], [{ kind: "former" }], [{ kind: "inactive", days: 90 }], [{ kind: "member", userId: "u1" }]])("accepts %j", (ref) => {
    expect(requesterRefSchema.safeParse(ref).success).toBe(true)
  })

  it.each([
    [{ kind: "inactive", days: 0 }],
    [{ kind: "inactive", days: 3651 }],
    [{ kind: "member", userId: "" }],
    [{ kind: "member", userId: "x".repeat(65) }],
    [{ kind: "someone" }],
  ])("refuses %j", (ref) => {
    expect(requesterRefSchema.safeParse(ref).success).toBe(false)
  })
})

describe("ids", () => {
  it.each(["c1", "c999", "p1", "p42"])("accepts the condition id %s", (id) => expect(conditionIdSchema.safeParse(id).success).toBe(true))
  it.each(["c0", "c1000", "a1", "g1", "C1", "c01", ""])("refuses the condition id %j", (id) => expect(conditionIdSchema.safeParse(id).success).toBe(false))
  it.each(["a1", "a999"])("accepts the group id %s", (id) => expect(groupIdSchema.safeParse(id).success).toBe(true))
  it.each(["a0", "g1", "c1", "a1000"])("refuses the group id %s", (id) => expect(groupIdSchema.safeParse(id).success).toBe(false))
})

describe("conditionSchema", () => {
  it.each(FIELD_IDS)("accepts the default row of %s (TS 4.2)", (field) => {
    expect(conditionSchema.safeParse(buildCondition(field)).success).toBe(true)
  })

  const valid: [string, unknown][] = [
    ["watch.lastPlayed lessThan", buildCondition("watch.lastPlayed", { op: "lessThan", value: { duration: days(30), orNever: false } })],
    ["watch.lastPlayed never", buildCondition("watch.lastPlayed", { op: "never" })],
    ["watch.plays atLeast in a window", buildCondition("watch.plays", { op: "atLeast", value: { count: 1000, window: { kind: "last", duration: days(1, "years") } } })],
    ["watch.plays fewerThan 0 (the definition check refuses it)", buildCondition("watch.plays", { value: { count: 0, window: { kind: "total" } } })],
    ["request.exists true", buildCondition("request.exists", { value: { exists: true } })],
    ["request.age lessThan", buildCondition("request.age", { op: "lessThan" })],
    ["request.by anyOf 50 refs", buildCondition("request.by", { op: "anyOf", value: { requesters: Array.from({ length: 50 }, () => ({ kind: "anyMember" as const })) } })],
    ["request.by noneOf", buildCondition("request.by", { op: "noneOf", value: { requesters: [{ kind: "member", userId: "u1" }] } })],
    ["request.requesters allFinished", buildCondition("request.requesters", { value: { did: "allFinished" } })],
    ["library.added lessThan", buildCondition("library.added", { op: "lessThan" })],
    ["file.size 1 GB", buildCondition("file.size", { op: "lessThan", value: { bytes: GiB, unit: "GB" } })],
    ["file.size 50 TB", buildCondition("file.size", { value: { bytes: 50 * TiB, unit: "TB" } })],
    ["show.status continuing", buildCondition("show.status", { value: { status: "continuing" } })],
    ["show.lastEpisodeAdded lessThan", buildCondition("show.lastEpisodeAdded", { op: "lessThan" })],
    ["show.seasonsOnDisk fewerThan 100", buildCondition("show.seasonsOnDisk", { op: "fewerThan", value: { count: 100 } })],
    ["season.position newest 20", buildCondition("season.position", { op: "newest", value: { count: 20 } })],
  ]
  it.each(valid)("accepts %s", (_name, condition) => {
    expect(conditionSchema.safeParse(condition).success).toBe(true)
  })

  const invalid: [string, unknown][] = [
    ["an unknown field", { id: "c1", field: "watch.rating", op: "is", value: {} }],
    ["watch.lastPlayed with an operator of another field", { ...buildCondition("watch.lastPlayed"), op: "atLeast" }],
    ["watch.lastPlayed without orNever", { ...buildCondition("watch.lastPlayed"), value: { duration: days(30) } }],
    ["watch.lastPlayed 3651 days", buildCondition("watch.lastPlayed", { value: { duration: days(3651), orNever: true } })],
    ["watch.plays 1001", buildCondition("watch.plays", { value: { count: 1001, window: { kind: "total" } } })],
    ["watch.plays a negative count", buildCondition("watch.plays", { value: { count: -1, window: { kind: "total" } } })],
    ["watch.plays an unknown window", { ...buildCondition("watch.plays"), value: { count: 1, window: { kind: "ever" } } }],
    ["request.exists with an operator", { ...buildCondition("request.exists"), op: "moreThan" }],
    ["request.age 11 years", buildCondition("request.age", { value: { duration: days(11, "years") } })],
    ["request.by no refs", buildCondition("request.by", { value: { requesters: [] } })],
    ["request.by 51 refs", buildCondition("request.by", { value: { requesters: Array.from({ length: 51 }, () => ({ kind: "former" as const })) } })],
    ["request.requesters an unknown value", { ...buildCondition("request.requesters"), value: { did: "requested" } }],
    ["library.added 122 months", buildCondition("library.added", { value: { duration: days(122, "months") } })],
    ["file.size under 1 GB", buildCondition("file.size", { value: { bytes: GiB - 1, unit: "GB" } })],
    ["file.size over 50 TB", buildCondition("file.size", { value: { bytes: 50 * TiB + 1, unit: "TB" } })],
    ["file.size in MB", { ...buildCondition("file.size"), value: { bytes: 20 * GiB, unit: "MB" } }],
    ["show.status upcoming", { ...buildCondition("show.status"), value: { status: "upcoming" } }],
    ["show.lastEpisodeAdded 522 weeks", buildCondition("show.lastEpisodeAdded", { value: { duration: days(522, "weeks") } })],
    ["show.seasonsOnDisk 0", buildCondition("show.seasonsOnDisk", { value: { count: 0 } })],
    ["show.seasonsOnDisk 101", buildCondition("show.seasonsOnDisk", { value: { count: 101 } })],
    ["season.position 0", buildCondition("season.position", { value: { count: 0 } })],
    ["season.position 21", buildCondition("season.position", { value: { count: 21 } })],
    ["a group id", buildCondition("show.status", { id: "a1" })],
  ]
  it.each(invalid)("refuses %s", (_name, condition) => {
    expect(conditionSchema.safeParse(condition).success).toBe(false)
  })
})

describe("groupSchema", () => {
  const member = (id: string) => buildCondition("watch.lastPlayed", { id })

  it("holds 2 to 10 conditions", () => {
    expect(groupSchema.safeParse({ id: "a1", kind: "anyOf", conditions: [member("c1"), member("c2")] }).success).toBe(true)
    const ten = Array.from({ length: 10 }, (_, i) => member(`c${i + 1}`))
    expect(groupSchema.safeParse({ id: "a1", kind: "anyOf", conditions: ten }).success).toBe(true)
    expect(groupSchema.safeParse({ id: "a1", kind: "anyOf", conditions: [member("c1")] }).success).toBe(false)
    expect(groupSchema.safeParse({ id: "a1", kind: "anyOf", conditions: [...ten, member("c11")] }).success).toBe(false)
  })

  it("holds conditions only, never a group", () => {
    const inner = { id: "a2", kind: "anyOf", conditions: [member("c1"), member("c2")] }
    expect(groupSchema.safeParse({ id: "a1", kind: "anyOf", conditions: [inner, member("c3")] }).success).toBe(false)
  })
})

describe("thenSchema", () => {
  it("takes a grace period of 1 to 3650 days and a known action", () => {
    expect(thenSchema.safeParse({ graceDays: 1, action: "season.unmonitorDeleteFiles", importListExclusion: false }).success).toBe(true)
    expect(thenSchema.safeParse({ graceDays: 3650, action: "show.delete", importListExclusion: true }).success).toBe(true)
    expect(thenSchema.safeParse({ graceDays: 0, action: "show.delete", importListExclusion: true }).success).toBe(false)
    expect(thenSchema.safeParse({ graceDays: 3651, action: "show.delete", importListExclusion: true }).success).toBe(false)
    expect(thenSchema.safeParse({ graceDays: 30, action: "season.delete", importListExclusion: false }).success).toBe(false)
  })
})

describe("ruleDefinitionSchema", () => {
  it("accepts a valid rule of each level", () => {
    expect(RULE_SCHEMA_VERSION).toBe(1)
    expect(ruleDefinitionSchema.safeParse(buildDefinition()).success).toBe(true)
    const show = buildDefinition({ level: "show", libraries: ["2"], conditions: [buildCondition("show.status")],
      then: { graceDays: 30, action: "show.unmonitorDeleteFiles", importListExclusion: false } })
    expect(ruleDefinitionSchema.safeParse(show).success).toBe(true)
    const season = buildDefinition({ level: "season", libraries: ["2"], conditions: [buildCondition("season.position")],
      protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 3, window: { kind: "total" } } })],
      then: { graceDays: 14, action: "season.unmonitorDeleteFiles", importListExclusion: false } })
    expect(ruleDefinitionSchema.safeParse(season).success).toBe(true)
  })

  it.each([
    ["another schema version", { schemaVersion: 2 }],
    ["no library", { libraries: [] }],
    ["21 libraries", { libraries: Array.from({ length: 21 }, (_, i) => String(i + 1)) }],
    ["a library id that is not a section id", { libraries: ["movies"] }],
    ["no condition", { conditions: [] }],
    ["21 conditions", { conditions: Array.from({ length: 21 }, (_, i) => buildCondition("watch.lastPlayed", { id: `c${i + 1}` })) }],
    ["11 protections", { protections: Array.from({ length: 11 }, (_, i) => buildCondition("watch.plays", { id: `p${i + 1}` })) }],
  ])("refuses %s", (_name, overrides) => {
    expect(ruleDefinitionSchema.safeParse({ ...buildDefinition(), ...overrides }).success).toBe(false)
  })

  it("holds 20 top-level clauses, groups included", () => {
    const conditions = Array.from({ length: 20 }, (_, i) => buildCondition("watch.lastPlayed", { id: `c${i + 1}` }))
    expect(ruleDefinitionSchema.safeParse(buildDefinition({ conditions })).success).toBe(true)
  })
})

describe("checkDefinition", () => {
  const issues = (overrides: Parameters<typeof buildDefinition>[0]) => {
    const parsed = ruleDefinitionSchema.safeParse(buildDefinition(overrides))
    return (parsed.error?.issues ?? []).map((issue) => ({ path: issue.path, params: issue.code === "custom" ? issue.params : undefined }))
  }

  it("has five codes", () => {
    expect(CHECK_CODES).toEqual(["duplicate_id", "not_applicable", "action_level", "exclusion_action", "fewer_than_zero"])
  })

  it("gives duplicate_id on the second of two equal ids, across conditions, groups, members and protections", () => {
    const group = { id: "a1", kind: "anyOf" as const, conditions: [buildCondition("file.size", { id: "c2" }), buildCondition("library.added", { id: "c1" })] }
    expect(issues({ conditions: [buildCondition("watch.lastPlayed", { id: "c1" }), group] })).toEqual([
      { path: ["conditions", 1, "conditions", 1], params: { code: "duplicate_id", id: "c1" } },
    ])
    const groupTwice = { ...group, conditions: [buildCondition("file.size", { id: "c3" }), buildCondition("library.added", { id: "c4" })] }
    expect(issues({ conditions: [groupTwice, { ...groupTwice, conditions: [buildCondition("file.size", { id: "c5" }), buildCondition("library.added", { id: "c6" })] }] })).toEqual([
      { path: ["conditions", 1], params: { code: "duplicate_id", id: "a1" } },
    ])
    expect(issues({ protections: [buildCondition("watch.plays", { id: "p1" }), buildCondition("file.size", { id: "p1" })] })).toEqual([
      { path: ["protections", 1], params: { code: "duplicate_id", id: "p1" } },
    ])
  })

  it("gives not_applicable for a field of another level, in a condition, a group member or a protection", () => {
    expect(issues({ conditions: [buildCondition("show.status")] })).toEqual([{ path: ["conditions", 0], params: { code: "not_applicable", id: "c1" } }])
    const group = { id: "a1", kind: "anyOf" as const, conditions: [buildCondition("watch.lastPlayed", { id: "c2" }), buildCondition("season.position", { id: "c3" })] }
    expect(issues({ level: "show", libraries: ["2"], conditions: [group], then: { graceDays: 30, action: "show.delete", importListExclusion: false } })).toEqual([
      { path: ["conditions", 0, "conditions", 1], params: { code: "not_applicable", id: "c3" } },
    ])
    expect(issues({ protections: [buildCondition("show.seasonsOnDisk", { id: "p1" })] })).toEqual([
      { path: ["protections", 0], params: { code: "not_applicable", id: "p1" } },
    ])
  })

  it("gives action_level for an action of another level", () => {
    expect(issues({ then: { graceDays: 30, action: "show.delete", importListExclusion: true } })).toEqual([{ path: ["then", "action"], params: { code: "action_level" } }])
  })

  it("gives exclusion_action for an import list exclusion on an unmonitor action", () => {
    expect(issues({ then: { graceDays: 30, action: "movie.unmonitorDeleteFiles", importListExclusion: true } })).toEqual([
      { path: ["then", "importListExclusion"], params: { code: "exclusion_action" } },
    ])
  })

  it("gives fewer_than_zero for Plays fewer than 0, as a condition or a protection", () => {
    const zero = { count: 0, window: { kind: "total" as const } }
    expect(issues({ conditions: [buildCondition("watch.plays", { value: zero })] })).toEqual([
      { path: ["conditions", 0], params: { code: "fewer_than_zero", id: "c1" } },
    ])
    expect(issues({ protections: [buildCondition("watch.plays", { id: "p1", value: zero })] })).toEqual([
      { path: ["protections", 0], params: { code: "fewer_than_zero", id: "p1" } },
    ])
    expect(issues({ conditions: [buildCondition("watch.plays", { op: "atLeast", value: zero })] })).toEqual([])
  })

  it("adds one issue per problem", () => {
    const found = issues({ conditions: [buildCondition("show.status"), buildCondition("show.status")],
      then: { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: true } })
    expect(found.map((issue) => issue.params?.code)).toEqual(["not_applicable", "duplicate_id", "not_applicable", "action_level", "exclusion_action"])
  })

  it("still checks when only a limit fails, and not when a value has the wrong type", () => {
    expect(issues({ conditions: [], then: { graceDays: 30, action: "show.delete", importListExclusion: true } })).toEqual([
      { path: ["conditions"], params: undefined },
      { path: ["then", "action"], params: { code: "action_level" } },
    ])
    const parsed = ruleDefinitionSchema.safeParse({ ...buildDefinition(), level: 3, then: { graceDays: 30, action: "show.delete", importListExclusion: true } })
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["level"]])
  })
})
