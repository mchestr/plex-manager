/** The ten recipes (TS 6.10, UX 5.7): ids and gallery order, every chip at every level builds a valid definition, the defaults, needs, notes and the values schema. */

import { buildOptions, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { RECIPE_IDS, type RecipeId } from "@/lib/cleanup/constants"
import {
  defaultLibraries,
  getRecipe,
  type Recipe,
  RECIPES,
  recipeKeyDefault,
  recipeKeyHint,
  recipeLevel,
  recipeNeeds,
  recipeNote,
  recipeValueLabel,
  recipeValueParam,
  recipeValueParams,
  recipeValuesSchema,
  type RecipeValues,
} from "@/lib/cleanup/recipes"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import { type Condition, ruleDefinitionSchema } from "@/lib/validations/cleanup-rule"
import { FIELD_NEEDS, GiB, LEVEL_ARR, SERVICES, TiB } from "@/lib/validations/cleanup-vocabulary"

const options = buildOptions()
const libraries = buildSnapshotFacts().libraries
const ctx = { options, libraries }
const d = (amount: number) => ({ amount, unit: "days" as const })
const y = (amount: number) => ({ amount, unit: "years" as const })
const library = (overrides: Partial<SnapshotLibrary>): SnapshotLibrary => ({ ...libraries[0], ...overrides })
const flat = (conditions: ReturnType<Recipe["build"]>["conditions"]): Condition[] => conditions.flatMap((c) => ("kind" in c ? c.conditions : [c]))
/** The URL form of the lowest and the highest value of each key. */
const LOW: Record<string, string> = { duration: "1d", "file.size": String(GiB) }
const HIGH: Record<string, string> = { duration: "10y", "file.size": String(50 * TiB), "watch.plays": "1000", "show.seasonsOnDisk": "100",
  "season.position": "20", grace: "3650" }

const everyBuild = RECIPES.flatMap((recipe) =>
  recipe.levels.flatMap((level) =>
    recipe.keys.flatMap((key) => key.chips.map((chip) => [recipe.id, level, key.key, chip, recipe] as const))))

describe("the gallery", () => {
  it("holds the ten recipe ids in gallery order", () => {
    expect(RECIPES.map((recipe) => recipe.id)).toEqual([...RECIPE_IDS])
    expect(RECIPE_IDS).toEqual(["never-watched-movies", "big-shows-nobody-plays", "movies-nobody-watches", "requested-never-watched",
      "requester-finished", "former-members", "finished-shows", "old-seasons", "nobody-asked", "big-movies"])
    for (const id of RECIPE_IDS) expect(getRecipe(id).id).toBe(id)
  })

  it("names each recipe, its levels and its note as UX 5.7 does", () => {
    expect(RECIPES.map((r) => [r.id, r.name, r.levels.join(" ")])).toEqual([
      ["never-watched-movies", "Never watched movies", "movie"],
      ["big-shows-nobody-plays", "Big shows nobody plays", "show"],
      ["movies-nobody-watches", "Movies nobody watches", "movie"],
      ["requested-never-watched", "Requested, then never watched", "movie show"],
      ["requester-finished", "The requester finished it", "movie show"],
      ["former-members", "Requests from former members", "movie show"],
      ["finished-shows", "Finished shows nobody plays", "show"],
      ["old-seasons", "Old seasons nobody plays", "season"],
      ["nobody-asked", "Nobody asked, nobody watched", "movie"],
      ["big-movies", "Big movies, little watching", "movie"],
    ])
    expect(RECIPES.every((r) => r.version === 1)).toBe(true)
    expect(RECIPES.map((r) => recipeNote(r, libraries)).filter((n) => n !== null)).toEqual([
      "Good first rule. Its matches have no plays at all.",
      "Frees the most space. TV holds 82 % of your media.",
      "Only plex-manager knows who left.",
    ])
  })

  it("words the TV share of the big shows note from the library sizes", () => {
    const recipe = getRecipe("big-shows-nobody-plays")
    expect(recipeNote(recipe, [library({ type: "movie", bytes: 9 }), library({ type: "show", bytes: 91 })])).toBe("Frees the most space. TV holds 91 % of your media.")
    expect(recipeNote(recipe, [])).toBe("Frees the most space.")
  })

  it("ends every recipe with the grace key, and keeps each other default among its chips", () => {
    for (const recipe of RECIPES) {
      expect(recipe.keys.at(-1)?.key).toBe("grace")
      for (const key of recipe.keys.slice(0, -1)) expect(key.chips).toContainEqual(key.default)
    }
    expect(getRecipe("old-seasons").keys[3]).toMatchObject({ label: "Keep in Leaving soon for", chips: [14, 30, 60, 90] })
  })
})

describe("build", () => {
  it.each(everyBuild)("%s at %s with %s = %j passes ruleDefinitionSchema", (_id, level, key, chip, recipe) => {
    const parsed = ruleDefinitionSchema.safeParse(recipe.build({ [key]: chip }, level, ctx))
    expect(parsed.success).toBe(true)
  })

  it.each(RECIPES.flatMap((recipe) => recipe.levels.map((level) => [recipe.id, level, recipe] as const)))(
    "%s at %s passes at the ends of every key range", (_id, level, recipe) => {
      const schema = recipeValuesSchema(recipe)
      const at = (ends: Record<string, string>, fallback: string) =>
        schema.parse(Object.fromEntries(recipe.keys.map((k) => [k.key, ends[k.kind === "duration" ? "duration" : k.field] ?? fallback])))
      const low = at(LOW, "1")
      const high = at(HIGH, "1")
      expect(Object.keys(high).sort()).toEqual(recipe.keys.map((k) => k.key).sort())
      expect(ruleDefinitionSchema.safeParse(recipe.build(low, level, ctx)).success).toBe(true)
      expect(ruleDefinitionSchema.safeParse(recipe.build(high, level, ctx)).success).toBe(true)
    },
  )

  const conditionsAt = (recipe: Recipe, level: "movie" | "show" | "season") => recipe.build({}, level, ctx).conditions
  const lp = (id: string, days: number | ReturnType<typeof y>, orNever: boolean): Condition =>
    ({ id, field: "watch.lastPlayed", op: "moreThan", value: { duration: typeof days === "number" ? d(days) : days, orNever } })
  const added = (id: string, days: number): Condition => ({ id, field: "library.added", op: "moreThan", value: { duration: d(days) } })

  it.each<[RecipeId, "movie" | "show" | "season", Condition[]]>([
    ["never-watched-movies", "movie", [{ id: "c1", field: "watch.lastPlayed", op: "never", value: { duration: d(365), orNever: true } }, added("c2", 180)]],
    ["big-shows-nobody-plays", "show", [{ id: "c1", field: "file.size", op: "moreThan", value: { bytes: 100 * GiB, unit: "GB" } }, lp("c2", 365, true), added("c3", 365)]],
    ["movies-nobody-watches", "movie", [added("c1", 365), lp("c2", 365, true)]],
    ["requested-never-watched", "show", [
      { id: "c1", field: "request.age", op: "moreThan", value: { duration: d(120) } },
      { id: "c2", field: "request.requesters", op: "is", value: { did: "neverPlayed" } },
      lp("c3", 180, true),
    ]],
    ["requester-finished", "movie", [
      { id: "c1", field: "request.exists", op: "is", value: { exists: true } },
      { id: "c2", field: "request.requesters", op: "is", value: { did: "allFinished" } },
      lp("c3", 60, false),
    ]],
    ["requester-finished", "show", [
      { id: "c1", field: "request.exists", op: "is", value: { exists: true } },
      { id: "c2", field: "request.requesters", op: "is", value: { did: "allFinished" } },
      lp("c3", 60, false),
      { id: "c4", field: "show.status", op: "is", value: { status: "ended" } },
    ]],
    ["former-members", "movie", [{ id: "c1", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } }, lp("c2", 180, true), added("c3", 90)]],
    ["finished-shows", "show", [
      { id: "c1", field: "show.status", op: "is", value: { status: "ended" } },
      lp("c2", 365, true),
      { id: "c3", field: "show.lastEpisodeAdded", op: "moreThan", value: { duration: d(365) } },
    ]],
    ["old-seasons", "season", [
      { id: "c1", field: "season.position", op: "notNewest", value: { count: 2 } },
      lp("c2", 365, true),
      { id: "c3", field: "show.seasonsOnDisk", op: "atLeast", value: { count: 3 } },
    ]],
    ["nobody-asked", "movie", [
      { id: "c1", field: "request.exists", op: "is", value: { exists: false } },
      { id: "c2", field: "watch.lastPlayed", op: "never", value: { duration: d(365), orNever: true } },
      added("c3", 180),
    ]],
    ["big-movies", "movie", [
      { id: "c1", field: "file.size", op: "moreThan", value: { bytes: 20 * GiB, unit: "GB" } },
      { id: "c2", field: "watch.plays", op: "fewerThan", value: { count: 2, window: { kind: "last", duration: d(365) } } },
      added("c3", 365),
    ]],
  ])("%s at %s builds the conditions of TS 6.10 with the defaults", (id, level, conditions) => {
    expect(conditionsAt(getRecipe(id), level)).toEqual(conditions)
  })

  it("puts the key values into the conditions", () => {
    const def = getRecipe("big-shows-nobody-plays").build({ size: 2 * TiB, lastPlayed: y(2), grace: 60 }, "show", ctx)
    expect(def.conditions.slice(0, 2)).toEqual([
      { id: "c1", field: "file.size", op: "moreThan", value: { bytes: 2 * TiB, unit: "TB" } },
      lp("c2", y(2), true),
    ])
    expect(def.then.graceDays).toBe(60)
  })

  it("fills the Then settings, libraries and protections of UX 5.7", () => {
    expect(getRecipe("never-watched-movies").build({}, "movie", ctx)).toMatchObject({
      schemaVersion: 1, level: "movie", libraries: ["1"], protections: [], then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
    })
    expect(getRecipe("former-members").build({}, "show", ctx)).toMatchObject({ libraries: ["2"], then: { action: "show.delete", importListExclusion: true } })
    expect(getRecipe("old-seasons").build({}, "season", ctx)).toMatchObject({ libraries: ["2"], then: { action: "season.unmonitorDeleteFiles", importListExclusion: false } })
    const custom = buildOptions({ defaults: { graceDays: 45, importListExclusion: false } })
    expect(getRecipe("big-movies").build({}, "movie", { options: custom, libraries }).then).toEqual({ graceDays: 45, action: "movie.delete", importListExclusion: false })
  })

  it("never shares a key default with the definition or the parsed values", () => {
    const recipe = getRecipe("movies-nobody-watches")
    const def = recipe.build({}, "movie", ctx)
    const first = def.conditions[0]
    if ("kind" in first || first.field !== "library.added") throw new Error("the first condition is the added date")
    first.value.duration.amount = 1
    const parsed = recipeValuesSchema(recipe).parse({})
    const added = parsed.added
    if (typeof added !== "object") throw new Error("added is a duration")
    added.amount = 2
    expect(recipe.keys[0].default).toEqual(d(365))
    expect(recipe.build({}, "movie", ctx).conditions[0]).toEqual({ id: "c1", field: "library.added", op: "moreThan", value: { duration: d(365) } })
  })

  it("builds its first level for a level it does not offer", () => {
    expect(getRecipe("old-seasons").build({}, "movie", ctx).level).toBe("season")
    expect(getRecipe("requested-never-watched").build({}, "season", ctx).level).toBe("movie")
    expect(recipeLevel(getRecipe("former-members"), "show")).toBe("show")
    expect(recipeLevel(getRecipe("former-members"))).toBe("movie")
    expect(recipeLevel(getRecipe("former-members"), null)).toBe("movie")
  })
})

describe("defaultLibraries", () => {
  it("takes every section of the level with its arr and external ids, at most 20", () => {
    const list = [
      library({ sectionId: "1" }),
      library({ sectionId: "3", arr: null }),
      library({ sectionId: "4", noIds: true }),
      library({ sectionId: "5", type: "show", arr: "sonarr" }),
      library({ sectionId: "6", arr: "sonarr" }),
    ]
    expect(defaultLibraries("movie", list)).toEqual(["1"])
    expect(defaultLibraries("season", list)).toEqual(["5"])
    expect(defaultLibraries("movie", Array.from({ length: 25 }, (_, i) => library({ sectionId: String(i + 1) })))).toHaveLength(20)
    expect(defaultLibraries("show", [])).toEqual([])
  })
})

describe("recipeNeeds", () => {
  it.each(RECIPES.flatMap((recipe) => recipe.levels.map((level) => [recipe.id, level, recipe] as const)))(
    "%s at %s needs Plex, the arr and the needs of its fields", (_id, level, recipe) => {
      const def = recipe.build({}, level, ctx)
      const fields = flat(def.conditions).flatMap((c) => FIELD_NEEDS[c.field])
      const expected = new Set(["plex", LEVEL_ARR[level], ...fields])
      expect(recipeNeeds(recipe, level)).toEqual(SERVICES.filter((s) => expected.has(s)))
    },
  )

  it("adds the arr of the level for a two-level recipe", () => {
    expect(recipeNeeds(getRecipe("former-members"), "movie")).toEqual(["plex", "tautulli", "overseerr", "radarr"])
    expect(recipeNeeds(getRecipe("former-members"), "show")).toEqual(["plex", "tautulli", "overseerr", "sonarr"])
  })
})

describe("recipeValuesSchema", () => {
  const schema = recipeValuesSchema(getRecipe("big-movies"))

  it("fills a missing key with its default and leaves the grace for Settings", () => {
    expect(schema.parse({})).toEqual({ size: 20 * GiB, plays: 2 })
    expect(recipeValuesSchema(getRecipe("never-watched-movies")).parse({ grace: 60, other: 1 })).toEqual({ added: d(180), grace: 60 })
  })

  it("takes the URL form of each value", () => {
    expect(schema.parse({ size: String(40 * GiB), plays: "3", grace: "14" })).toEqual({ size: 40 * GiB, plays: 3, grace: 14 })
    const days = recipeValuesSchema(getRecipe("movies-nobody-watches"))
    expect(days.parse({ added: "2y", lastPlayed: "26w" })).toEqual({ added: y(2), lastPlayed: { amount: 26, unit: "weeks" } })
    expect(days.parse({ added: { amount: 6, unit: "months" } })).toMatchObject({ added: { amount: 6, unit: "months" } })
  })

  it.each<[string, Record<string, unknown>]>([
    ["a size below 1 GB", { size: 1024 }],
    ["a size above 50 TB", { size: 51 * TiB }],
    ["plays of 0", { plays: 0 }],
    ["a count that is not whole", { plays: 1.5 }],
    ["a grace of 0 days", { grace: 0 }],
    ["a grace above 3650 days", { grace: "3651" }],
    ["text", { plays: "two" }],
  ])("refuses %s", (_name, values) => {
    expect(schema.safeParse(values).success).toBe(false)
  })

  it("refuses a duration out of range or in the wrong form", () => {
    const days = recipeValuesSchema(getRecipe("never-watched-movies"))
    for (const added of ["180", "11y", "180x", 180, { amount: 0, unit: "days" }]) expect(days.safeParse({ added }).success).toBe(false)
  })
})

describe("values as words and URL parameters", () => {
  const [size, plays, grace] = getRecipe("big-movies").keys
  const [keepNewest] = getRecipe("old-seasons").keys
  const [addedKey] = getRecipe("never-watched-movies").keys

  it("writes each value as its URL form and reads it back", () => {
    const values: RecipeValues = { added: y(2), lastPlayed: { amount: 3, unit: "months" }, grace: 30, size: 20 * GiB, missing: undefined }
    const params = recipeValueParams(values)
    expect(params).toEqual({ added: "2y", lastPlayed: "3m", grace: "30", size: String(20 * GiB) })
    expect(recipeValueParam(d(180))).toBe("180d")
    expect(recipeValuesSchema(getRecipe("big-movies")).parse(params)).toEqual({ size: 20 * GiB, plays: 2, grace: 30 })
  })

  it.each<[string, Parameters<typeof recipeValueLabel>[0], Parameters<typeof recipeValueLabel>[1], string]>([
    ["days", addedKey, d(180), "180 days"],
    ["one year", addedKey, y(1), "1 year"],
    ["years", addedKey, y(2), "2 years"],
    ["GB", size, 100 * GiB, "100 GB"],
    ["TB", size, 1.5 * TiB, "1.5 TB"],
    ["a count", plays, 2, "2"],
    ["a season count", keepNewest, 3, "3"],
    ["grace days", grace, 30, "30 days"],
    ["one grace day", grace, 1, "1 day"],
  ])("words %s", (_name, key, value, words) => {
    expect(recipeValueLabel(key, value)).toBe(words)
  })

  it("starts the grace key at the Settings default and the others at their own default", () => {
    expect(recipeKeyDefault(grace, buildOptions({ defaults: { graceDays: 45 } }))).toBe(45)
    expect(recipeKeyDefault(addedKey, options)).toEqual(d(180))
  })

  it("gives the hints of UX 8.3", () => {
    expect(recipeKeyHint(addedKey, "movie")).toBe("Uses the newer of the Plex and Radarr dates")
    expect(recipeKeyHint(addedKey, "show")).toBe("Uses the newer of the Plex and Sonarr dates")
    expect(recipeKeyHint(grace, "movie")).toBe("Members can keep a title during this time")
    expect(recipeKeyHint(size, "movie")).toBeNull()
  })

  it("labels the keys as UX 8.3 does", () => {
    const labels = new Set(RECIPES.flatMap((recipe) => recipe.keys.map((key) => key.label)))
    expect([...labels].sort()).toEqual([
      "Added more than", "Keep in Leaving soon for", "Keep the newest", "Last episode added more than", "Last played more than",
      "Plays, fewer than", "Requested more than", "Seasons on disk, at least", "Size more than",
    ])
  })
})
