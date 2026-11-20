/**
 * @jest-environment node
 */

/** The recipe Sheet's live result (TS 10.5 `RecipePreview`, UX 4.2.2): chip counts, both levels of a two-level recipe, and no library data. */

jest.mock("@/lib/cleanup/preview/load", () => ({ ...jest.requireActual("@/lib/cleanup/preview/load"), loadLevel: jest.fn(), loadContext: jest.fn() }))

import { buildMovieItem, buildOptions, buildShowItem, buildSnapshotFacts, buildSourceStatuses, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import { loadContext, loadLevel, type LevelData } from "@/lib/cleanup/preview/load"
import { recipePreview, runRecipePreview } from "@/lib/cleanup/preview/recipe-preview"
import { getRecipe } from "@/lib/cleanup/recipes"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CompleteHeader } from "@/lib/cleanup/snapshot/cache"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const header: CompleteHeader = { id: "snap-1", status: "complete", trigger: "scheduled", actorId: null, startedAt: new Date(NOW - 60_000),
  finishedAt: new Date(NOW), sources: buildSourceStatuses({ overseerr: { state: "notConfigured" } }), facts: buildSnapshotFacts() }
const never = { lastCountedAt: null, countedAt: [], viewers: [] }

/** Movies added 100, 200, 400 and 800 days ago, never played, of growing size. */
const MOVIES = [100, 200, 400, 800].map((days, i) =>
  buildMovieItem({ key: `movie:tmdb:${i + 1}`, title: `Movie ${i + 1}`, added: { plex: daysAgo(days), arr: daysAgo(days) }, plays: never, sizeBytes: (i + 1) * 10 * GiB }))
const data = (items: SnapshotItem[]): LevelData => ({ header, items, byKey: new Map(items.map((i) => [i.key, i])), shows: [] })

describe("recipePreview", () => {
  it("counts each chip with only that key changed, and gives grace no counts", () => {
    const preview = recipePreview({ recipe: getRecipe("never-watched-movies"), values: {}, level: "movie", data: data(MOVIES), ctx: realContext() })
    expect(preview).toMatchObject({ recipeId: "never-watched-movies", level: "movie", checked: 4, matches: 3, bytes: String(90 * GiB), protectedCount: 0,
      takenAt: header.facts.takenAt, historyStart: new Date(daysAgo(3 * 365) * 1000).toISOString(), needs: [] })
    expect(preview.chips).toEqual({ added: [
      { value: { amount: 90, unit: "days" }, label: "90 days", matches: 4 },
      { value: { amount: 180, unit: "days" }, label: "180 days", matches: 3 },
      { value: { amount: 365, unit: "days" }, label: "365 days", matches: 2 },
      { value: { amount: 2, unit: "years" }, label: "2 years", matches: 1 },
    ] })
    expect(preview.largest.map((l) => l.title)).toEqual(["Movie 4", "Movie 3", "Movie 2"])
    expect(preview.largest[0].why[0]).toEqual({ text: "Never played.", strong: true })
    expect(preview.sentence.map((p) => p.text).join("")).toMatch(/^Movies in the Movies library that were never played/)
  })

  it("previews a two-level recipe at either level, and names a service it needs that is not set up", () => {
    const recipe = getRecipe("requested-never-watched")
    const movie = recipePreview({ recipe, values: {}, level: "movie", data: data(MOVIES), ctx: realContext() })
    expect(movie).toMatchObject({ level: "movie", checked: 4, needs: ["overseerr"] })
    expect(Object.keys(movie.chips)).toEqual(["requested", "lastPlayed"])
    const shows = [buildShowItem({ plays: never })]
    const show = recipePreview({ recipe, values: {}, level: "show", data: data(shows), ctx: realContext() })
    expect(show).toMatchObject({ level: "show", checked: 1, needs: ["overseerr"] })
    expect(show.sentence[0].text).toBe("Whole shows in the ")
  })

  it("answers with no library data", () => {
    const preview = recipePreview({ recipe: getRecipe("big-movies"), values: {}, level: "movie", data: null, ctx: realContext() })
    expect(preview).toMatchObject({ checked: 0, matches: 0, bytes: "0", largest: [], historyStart: null, takenAt: null, needs: [] })
    expect(preview.chips.size.every((chip) => chip.matches === 0)).toBe(true)
  })
})

describe("runRecipePreview", () => {
  beforeEach(() => {
    jest.mocked(loadLevel).mockResolvedValue(data(MOVIES))
    jest.mocked(loadContext).mockResolvedValue({ ctx: realContext(), holdUntil: null, paused: false })
  })

  it("parses the values with the recipe's own schema, URL forms included", async () => {
    const result = await runRecipePreview({ recipeId: "never-watched-movies", values: { added: "1y", grace: 14 } })
    expect(result).toMatchObject({ ok: true, data: { matches: 2 } })
    expect(loadLevel).toHaveBeenCalledWith("movie")
  })

  it("builds the first level for a level the recipe does not offer", async () => {
    await runRecipePreview({ recipeId: "never-watched-movies", level: "show", values: {} })
    expect(loadLevel).toHaveBeenLastCalledWith("movie")
  })

  it("refuses values that the recipe does not take", async () => {
    const result = await runRecipePreview({ recipeId: "never-watched-movies", values: { added: "forever" } })
    expect(result.ok).toBe(false)
  })

  it("previews with no snapshot", async () => {
    jest.mocked(loadLevel).mockResolvedValue(null)
    expect(await runRecipePreview({ recipeId: "never-watched-movies", values: {} })).toMatchObject({ ok: true, data: { checked: 0 } })
    expect(loadContext).toHaveBeenLastCalledWith(null, [], expect.any(Date))
  })

  it("counts the global protections that are on at the level: 10 for movies, 12 for seasons, one less with G2 off", () => {
    const at = (recipeId: "never-watched-movies" | "old-seasons", level: "movie" | "season", options = buildOptions()) =>
      recipePreview({ recipe: getRecipe(recipeId), values: {}, level, data: null, ctx: realContext({ options }) }).globalProtections
    expect(at("never-watched-movies", "movie")).toBe(10)
    expect(at("old-seasons", "season")).toBe(12)
    expect(at("never-watched-movies", "movie", buildOptions({ protections: { g2: { enabled: false } } }))).toBe(9)
  })

  it("names the condition that removes the most at 0 matches, with the largest title that passes the other conditions", () => {
    const fresh = MOVIES.map((movie) => ({ ...movie, added: { plex: daysAgo(10), arr: daysAgo(10) } }))
    const preview = recipePreview({ recipe: getRecipe("never-watched-movies"), values: {}, level: "movie", data: data(fresh), ctx: realContext() })
    expect(preview.matches).toBe(0)
    expect(preview.zero).toEqual({ conditionId: expect.any(String), sentence: expect.stringMatching(/^Added more than 180 days/), leaves: 0, of: 4,
      largestBytes: String(40 * GiB) })
    expect(recipePreview({ recipe: getRecipe("never-watched-movies"), values: {}, level: "movie", data: data(MOVIES), ctx: realContext() }).zero).toBeNull()
  })
})

