/** What a rule covers (TS 6.1, E32): its level and its libraries, from a compiled scope or a stored definition. */

import { buildDefinition, buildMovieItem, buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type { RuleScope } from "@/lib/cleanup/engine/types"

describe("ruleCoversItem", () => {
  const scope: RuleScope = { level: "movie", libraries: ["1", "3"] }

  it.each([
    ["an item in scope", buildMovieItem({ sectionId: "1" }), true],
    ["an item in the second library", buildMovieItem({ sectionId: "3" }), true],
    ["an item of another library", buildMovieItem({ sectionId: "4" }), false],
    ["an item of another level", buildShowItem({ sectionId: "1" }), false],
    ["a season of another level", buildSeasonItem(buildShowItem({ sectionId: "1" })), false],
  ])("%s", (_name, item, expected) => {
    expect(ruleCoversItem(scope, item)).toBe(expected)
  })

  it("takes a stored definition", () => {
    const def = buildDefinition({ level: "show", libraries: ["2"] })
    expect(ruleCoversItem(def, buildShowItem())).toBe(true)
    expect(ruleCoversItem(def, buildShowItem({ sectionId: "9" }))).toBe(false)
    expect(ruleCoversItem(def, buildSeasonItem())).toBe(false)
  })

  it("takes a compiled scope", () => {
    const compiled = compileDefinition(buildDefinition({ level: "season", libraries: ["2"] }))
    expect(ruleCoversItem(compiled.scope, buildSeasonItem())).toBe(true)
    expect(ruleCoversItem(compiled.scope, buildShowItem())).toBe(false)
  })

  it("takes a stored item row with plain string fields", () => {
    const row: { level: string; sectionId: string } = { level: "movie", sectionId: "1" }
    expect(ruleCoversItem(scope, row)).toBe(true)
    expect(ruleCoversItem(scope, { ...row, level: "episode" })).toBe(false)
  })

  it("covers nothing with no library", () => {
    expect(ruleCoversItem({ level: "movie", libraries: [] }, buildMovieItem())).toBe(false)
  })
})
