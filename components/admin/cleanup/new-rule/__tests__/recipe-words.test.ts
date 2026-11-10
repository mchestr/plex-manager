/**
 * The words of the New rule Sheet (UX 8.3): the "Today" count of a picker
 * row, the line under the largest matches, and the Other amounts.
 */

import { largestLine, otherAmount, otherValue, recipeLevelOf, todayText } from "@/components/admin/cleanup/new-rule/recipe-words"
import { getRecipe } from "@/lib/cleanup/recipes"
import type { RecipePreview } from "@/lib/cleanup/types/preview"
import { bindFormat } from "@/lib/utils/format"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

const item = (title: string, gb: number): RecipePreview["largest"][number] => ({
  itemKey: `movie:tmdb:${gb}`, level: "movie", title, year: null, seasonNumber: null, episodeCount: null, seasonCount: null, posterKey: null,
  sectionId: "1", sizeBytes: String(gb * GiB), why: [],
})

describe("todayText", () => {
  it("counts one level, both levels of a two-level recipe, and nothing without data", () => {
    expect(todayText({ level: "season", today: { count: 1, bytes: "0" } }, f)).toBe("Today: 1 season")
    expect(todayText({ level: "movieOrShow", today: { count: 1200, bytes: "0", altCount: 1 } }, f)).toBe("Today: 1,200 movies or 1 show")
    expect(todayText({ level: "movieOrShow", today: { count: 3, bytes: "0" } }, f)).toBe("Today: 3 movies")
    expect(todayText({ level: "movie", today: null }, f)).toBeNull()
  })
})

describe("largestLine", () => {
  it("names three titles and the rest as a count", () => {
    expect(largestLine({ matches: 152, largest: [item("Babylon", 22), item("Napoleon", 17), item("Empire of Light", 13), item("Tenet", 8)] }))
      .toBe("Babylon 22 GB, Napoleon 17 GB, Empire of Light 13 GB and 149 more")
  })

  it("joins two or three titles with and, and keeps one alone", () => {
    expect(largestLine({ matches: 3, largest: [item("A", 3), item("B", 2), item("C", 1)] })).toBe("A 3 GB, B 2 GB and C 1 GB")
    expect(largestLine({ matches: 2, largest: [item("A", 3), item("B", 2)] })).toBe("A 3 GB and B 2 GB")
    expect(largestLine({ matches: 1, largest: [item("A", 3)] })).toBe("A 3 GB")
  })
})

describe("Other amounts", () => {
  const keys = getRecipe("big-movies").keys
  const added = getRecipe("never-watched-movies").keys[0]

  it("reads a duration as days and a size as GB, and writes them back", () => {
    expect(otherAmount(added, { amount: 2, unit: "years" })).toBe(730)
    expect(otherAmount(keys[0], 20 * GiB)).toBe(20)
    expect(otherAmount(keys[1], 2)).toBe(2)
    expect(otherAmount(added, undefined)).toBeNull()
    expect(otherValue(added, 400)).toEqual({ amount: 400, unit: "days" })
    expect(otherValue(keys[0], 30)).toBe(30 * GiB)
  })

  it("names the level of a recipe", () => {
    expect(recipeLevelOf(getRecipe("former-members"))).toBe("movieOrShow")
    expect(recipeLevelOf(getRecipe("old-seasons"))).toBe("season")
  })
})
