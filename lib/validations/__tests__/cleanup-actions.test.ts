/** The action inputs (TS 3.5): the rule id pattern, item keys, batch ids, the batch forms and the settings union. */

import { buildDefinition, KEYS_HASH_VECTOR, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  approveEntryBatchInput,
  batchIdSchema,
  batchSelectionInput,
  CLEANUP_SETTINGS_SECTIONS,
  createCleanupRuleFromRecipeInput,
  createCleanupRuleInput,
  dayKeySchema,
  deleteCleanupBatchInput,
  excludeInput,
  exclusionEndInput,
  exclusionIdInput,
  itemKeySchema,
  itemKeysSchema,
  itemWhyInput,
  keepIdInput,
  keepTitleInput,
  keysHashSchema,
  parseBatchId,
  postponeInput,
  previewRecipeInput,
  previewRequestSchema,
  protectionImpactInput,
  removeMyKeepInput,
  RULE_ID_PATTERN,
  ruleIdSchema,
  ruleRefInput,
  saveCleanupRuleInput,
  turnOnCleanupRuleInput,
  turnOnReturnToSchema,
  updateCleanupSettingsInput,
} from "@/lib/validations/cleanup-actions"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const CUID = "cmh0a1b2c3d4e5f6g7h8i9j0k"
const HASH = KEYS_HASH_VECTOR.hash
const REVIEWED = new Date(NOW).toISOString()
const ok = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) => schema.safeParse(value).success

describe("RULE_ID_PATTERN (delivery-r4-1)", () => {
  it.each([CUID, "a11y-cleanup-rule-live", "rule_1", "x".repeat(40)])("accepts %s", (id) => {
    expect(RULE_ID_PATTERN.test(id)).toBe(true)
    expect(ok(ruleIdSchema, id)).toBe(true)
  })

  it.each(["a/b", "", "x".repeat(41), "a b", "a.b", "ünï"])("refuses %j", (id) => {
    expect(RULE_ID_PATTERN.test(id)).toBe(false)
    expect(ok(ruleIdSchema, id)).toBe(false)
  })
})

describe("item keys", () => {
  it.each(["movie:tmdb:753342", "show:tvdb:121361", "season:tvdb:121361:4", "movie:imdb:tt0111161"])("accepts %s", (key) => {
    expect(ok(itemKeySchema, key)).toBe(true)
  })

  it.each(["episode:tvdb:1", "movie:TMDB:1", "movie:tmdb:", "movie:tmdb:1:x", "season:tvdb:1:4:5", `movie:tmdb:${"1".repeat(80)}`])("refuses %s", (key) => {
    expect(ok(itemKeySchema, key)).toBe(false)
  })

  it("takes 1 to 500 keys", () => {
    expect(ok(itemKeysSchema, ["movie:tmdb:1"])).toBe(true)
    expect(ok(itemKeysSchema, Array.from({ length: 500 }, (_, i) => `movie:tmdb:${i}`))).toBe(true)
    expect(ok(itemKeysSchema, [])).toBe(false)
    expect(ok(itemKeysSchema, Array.from({ length: 501 }, (_, i) => `movie:tmdb:${i}`))).toBe(false)
  })

  it("checks day keys and hashes", () => {
    expect(ok(dayKeySchema, "2026-12-08")).toBe(true)
    expect(ok(dayKeySchema, "2026-12-8")).toBe(false)
    expect(ok(keysHashSchema, HASH)).toBe(true)
    expect(ok(keysHashSchema, HASH.toUpperCase())).toBe(false)
    expect(ok(keysHashSchema, HASH.slice(1))).toBe(false)
  })
})

describe("batch ids", () => {
  it.each(["deletion-a11y-cleanup-rule-live", `entry-${CUID}`, `deletion-${CUID}`])("batchIdSchema accepts %s", (id) => {
    expect(ok(batchIdSchema, id)).toBe(true)
  })

  it.each(["deletion-", "other-x", "deletion-a/b", "entry", `entry-${"x".repeat(41)}`])("batchIdSchema refuses %j", (id) => {
    expect(ok(batchIdSchema, id)).toBe(false)
  })

  it("parseBatchId splits at the first dash, so a rule id keeps its dashes", () => {
    expect(parseBatchId("deletion-a11y-cleanup-rule-live")).toEqual({ kind: "deletion", ruleId: "a11y-cleanup-rule-live" })
    expect(parseBatchId(`entry-${CUID}`)).toEqual({ kind: "entry", ruleId: CUID })
    expect(parseBatchId("other-x")).toBeNull()
    expect(parseBatchId("deletion-")).toBeNull()
  })

  it("turnOnReturnToSchema accepts the turn-on page of a hyphenated rule id only", () => {
    expect(ok(turnOnReturnToSchema, "/admin/cleanup/rules/a11y-cleanup-rule-live/turn-on")).toBe(true)
    expect(ok(turnOnReturnToSchema, `/admin/cleanup/rules/${CUID}/turn-on`)).toBe(true)
    expect(ok(turnOnReturnToSchema, "/admin/cleanup/rules/a11y/turn-on?x=1")).toBe(false)
    expect(ok(turnOnReturnToSchema, "https://example.com/admin/cleanup/rules/a/turn-on")).toBe(false)
    expect(ok(turnOnReturnToSchema, "/admin/cleanup/rules/../users/turn-on")).toBe(false)
  })
})

describe("rule inputs", () => {
  it("createCleanupRuleInput takes a trimmed name of 1 to 80 characters and a valid definition", () => {
    expect(createCleanupRuleInput.parse({ name: "  Old movies  ", definition: buildDefinition() }).name).toBe("Old movies")
    expect(ok(createCleanupRuleInput, { name: " ", definition: buildDefinition() })).toBe(false)
    expect(ok(createCleanupRuleInput, { name: "x".repeat(81), definition: buildDefinition() })).toBe(false)
    expect(ok(createCleanupRuleInput, { name: "Old", definition: { ...buildDefinition(), libraries: [] } })).toBe(false)
  })

  it("createCleanupRuleFromRecipeInput takes a recipe id, an optional level and key values", () => {
    expect(ok(createCleanupRuleFromRecipeInput, { recipeId: "never-watched-movies", values: { added: { amount: 180, unit: "days" } } })).toBe(true)
    expect(ok(createCleanupRuleFromRecipeInput, { recipeId: "former-members", level: "show", values: {} })).toBe(true)
    expect(ok(previewRecipeInput, { recipeId: "old-seasons", level: "season", values: {} })).toBe(false)
    expect(ok(createCleanupRuleFromRecipeInput, { recipeId: "no-such-recipe", values: {} })).toBe(false)
    expect(ok(createCleanupRuleFromRecipeInput, { recipeId: "big-movies", values: { ["k".repeat(31)]: 1 } })).toBe(false)
  })

  it("saveCleanupRuleInput needs the expected revision", () => {
    const input = { ruleId: CUID, name: "Old movies", definition: buildDefinition(), expectedRevision: 3 }
    expect(saveCleanupRuleInput.parse(input).confirmImpact).toBe(false)
    expect(ok(saveCleanupRuleInput, { ...input, expectedRevision: undefined })).toBe(false)
    expect(ok(saveCleanupRuleInput, { ...input, expectedRevision: 0 })).toBe(false)
    expect(ok(ruleRefInput, { ruleId: "a/b" })).toBe(false)
  })

  it("turnOnCleanupRuleInput sends the count and hash, never item keys (E28)", () => {
    const input = { ruleId: CUID, mode: "automatic", expectedRevision: 1, count: 0, keysHash: HASH, reviewedAt: REVIEWED }
    expect(ok(turnOnCleanupRuleInput, input)).toBe(true)
    expect(turnOnCleanupRuleInput.parse({ ...input, itemKeys: ["movie:tmdb:1"] })).not.toHaveProperty("itemKeys")
    expect(ok(turnOnCleanupRuleInput, { ...input, mode: "dryRun" })).toBe(false)
    expect(ok(turnOnCleanupRuleInput, { ...input, keysHash: undefined })).toBe(false)
    expect(ok(turnOnCleanupRuleInput, { ...input, count: -1 })).toBe(false)
    expect(ok(turnOnCleanupRuleInput, { ...input, reviewedAt: "yesterday" })).toBe(false)
  })
})

describe("preview inputs", () => {
  it("previewRequestSchema fills the defaults and takes a draft", () => {
    const draft = { ...buildDefinition(), conditions: [{ id: "c1", field: "watch.plays", op: "fewerThan", value: {} }] }
    expect(previewRequestSchema.parse({ definition: draft })).toMatchObject({ tab: "matches", sort: "largest", page: 1 })
    expect(ok(previewRequestSchema, { definition: draft, page: 201 })).toBe(false)
    expect(ok(previewRequestSchema, { definition: draft, nearMissCondition: "a2", focus: { conditionId: "p1" } })).toBe(true)
    expect(ok(previewRequestSchema, { definition: draft, nearMissCondition: "p1" })).toBe(false)
    expect(ok(previewRequestSchema, { definition: draft, search: "x".repeat(101) })).toBe(false)
  })

  it("protectionImpactInput takes the protections only (E30)", () => {
    expect(protectionImpactInput.parse({ protections: {}, keepsEnabled: false })).not.toHaveProperty("keepsEnabled")
    expect(ok(itemWhyInput, { itemKey: "movie:tmdb:1", outcomeId: "x".repeat(41) })).toBe(false)
    expect(ok(itemWhyInput, { itemKey: "movie:tmdb:1", ruleId: CUID, definition: buildDefinition() })).toBe(true)
  })
})

describe("batch inputs", () => {
  const selected = { count: 5, action: "movie.delete", exclusionCount: 2 }
  const approval = { batchId: `deletion-${CUID}`, count: 6, keysHash: HASH, excludeKeys: ["movie:tmdb:1"], selected, reviewedAt: REVIEWED }

  it("deleteCleanupBatchInput takes a deletion batch with the selection it names (E36)", () => {
    expect(ok(deleteCleanupBatchInput, approval)).toBe(true)
    expect(deleteCleanupBatchInput.parse({ ...approval, excludeKeys: undefined }).excludeKeys).toEqual([])
    expect(ok(deleteCleanupBatchInput, { ...approval, selected: undefined })).toBe(false)
    expect(ok(deleteCleanupBatchInput, { ...approval, selected: { ...selected, count: 0 } })).toBe(false)
    expect(ok(deleteCleanupBatchInput, { ...approval, excludeKeys: Array.from({ length: 501 }, (_, i) => `movie:tmdb:${i}`) })).toBe(false)
  })

  it("deleteCleanupBatchInput refuses an entry batch, and approveEntryBatchInput a deletion batch (architecture-r6-6)", () => {
    expect(ok(deleteCleanupBatchInput, { ...approval, batchId: `entry-${CUID}` })).toBe(false)
    const entry = { batchId: `entry-${CUID}`, count: 52, keysHash: HASH, reviewedAt: REVIEWED }
    expect(ok(approveEntryBatchInput, entry)).toBe(true)
    expect(ok(approveEntryBatchInput, { ...entry, batchId: `deletion-${CUID}` })).toBe(false)
  })

  it("batchSelectionInput takes a deletion batch only (architecture-r5-4)", () => {
    expect(ok(batchSelectionInput, { batchId: `deletion-${CUID}`, keys: ["movie:tmdb:1"] })).toBe(true)
    expect(ok(batchSelectionInput, { batchId: `entry-${CUID}`, keys: ["movie:tmdb:1"] })).toBe(false)
    expect(ok(batchSelectionInput, { batchId: `deletion-${CUID}`, keys: [] })).toBe(false)
  })
})

describe("postpone and exclude (E37)", () => {
  const batch = { batchId: "deletion-a11y-cleanup-rule-live", count: 60, keysHash: HASH, excludeKeys: ["movie:tmdb:1"], selectedCount: 59 }

  it.each([
    ["postponeInput", postponeInput, { days: 7 }],
    ["excludeInput", excludeInput, { until: null, note: "Keep for the holidays" }],
  ] as const)("%s takes item keys alone or the batch form alone", (_name, schema, rest) => {
    expect(ok(schema, { ...rest, itemKeys: ["movie:tmdb:1"] })).toBe(true)
    expect(ok(schema, { ...rest, batch })).toBe(true)
    expect(ok(schema, { ...rest, itemKeys: ["movie:tmdb:1"], batch })).toBe(false)
    expect(ok(schema, { ...rest })).toBe(false)
    expect(ok(schema, { ...rest, batch: { ...batch, keysHash: undefined } })).toBe(false)
    expect(ok(schema, { ...rest, batch: { ...batch, batchId: "entry-a11y-cleanup-rule-live" } })).toBe(false)
    expect(ok(schema, { ...rest, batch: { ...batch, selectedCount: 0 } })).toBe(false)
  })

  it("names the target issue and keeps an object schema for MCP", () => {
    const parsed = postponeInput.safeParse({ days: 7 })
    expect(parsed.error?.issues[0]).toMatchObject({ message: "Send exactly one of itemKeys and batch", path: ["itemKeys"] })
    expect(Object.keys(postponeInput.shape)).toEqual(["itemKeys", "batch", "days"])
    expect(Object.keys(excludeInput.shape)).toEqual(["itemKeys", "batch", "until", "note"])
  })

  it("checks the postpone days and the exclusion end and note", () => {
    expect(ok(postponeInput, { itemKeys: ["movie:tmdb:1"], days: 0 })).toBe(false)
    expect(ok(postponeInput, { itemKeys: ["movie:tmdb:1"], days: 3651 })).toBe(false)
    expect(ok(excludeInput, { itemKeys: ["movie:tmdb:1"], until: "2027-01-31" })).toBe(true)
    expect(ok(excludeInput, { itemKeys: ["movie:tmdb:1"] })).toBe(false)
    expect(ok(excludeInput, { itemKeys: ["movie:tmdb:1"], until: null, note: "x".repeat(501) })).toBe(false)
  })
})

describe("Keep and exclusion inputs", () => {
  it("take ids of 1 to 40 characters", () => {
    expect(ok(keepIdInput, { keepId: "k1" })).toBe(true)
    expect(ok(keepIdInput, { keepId: "" })).toBe(false)
    expect(ok(exclusionIdInput, { exclusionId: "x".repeat(41) })).toBe(false)
    expect(ok(exclusionEndInput, { exclusionId: "e1", until: null })).toBe(true)
    expect(ok(exclusionEndInput, { exclusionId: "e1", until: "soon" })).toBe(false)
    expect(ok(keepTitleInput, { itemKey: "season:tvdb:1:2" })).toBe(true)
    expect(removeMyKeepInput.parse({ keepId: "k1" }).restore).toBe(false)
  })
})

describe("updateCleanupSettingsInput", () => {
  it("has one member for each Settings section", () => {
    expect(CLEANUP_SETTINGS_SECTIONS).toEqual(["cleanup-feature", "cleanup-protections", "cleanup-budget", "cleanup-defaults", "cleanup-plex", "cleanup-members"])
  })

  it.each([
    ["cleanup-feature", { enabled: true }],
    ["cleanup-protections", { protections: { g4: { enabled: false, days: 30 } } }],
    ["cleanup-budget", { items: 10, bytes: 200 * GiB, entryCheck: { count: 25, percent: 5 }, automaticMinGraceDays: 14 }],
    ["cleanup-defaults", { graceDays: 60, importListExclusion: false }],
    ["cleanup-plex", { showCollections: true, ownHome: false, sharedHome: true, recommended: false }],
    ["cleanup-members", { keepsEnabled: false, keepDays: 30, keepLimit: 5, pageEnabled: true }],
  ])("accepts the %s section", (section, values) => {
    expect(ok(updateCleanupSettingsInput, { section, values })).toBe(true)
  })

  it.each([
    ["cleanup-feature", { enabled: "yes" }],
    ["cleanup-budget", { items: 10, bytes: 200 * GiB, entryCheck: { count: 25, percent: 5 }, automaticMinGraceDays: 6 }],
    ["cleanup-budget", { items: 501, bytes: 200 * GiB, entryCheck: { count: 25, percent: 5 }, automaticMinGraceDays: 7 }],
    ["cleanup-defaults", { graceDays: 0, importListExclusion: false }],
    ["cleanup-members", { keepsEnabled: true, keepDays: 400, keepLimit: 5, pageEnabled: true }],
    ["cleanup-unknown", { enabled: true }],
  ])("refuses bad values of the %s section", (section, values) => {
    expect(ok(updateCleanupSettingsInput, { section, values })).toBe(false)
  })
})
