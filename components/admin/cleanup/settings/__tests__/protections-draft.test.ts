/**
 * The pure parts of the Global protections form: the draft check, the list
 * limits, "Add both", the count words and the full sentence of each row.
 */

import { buildProtections } from "@/components/admin/cleanup/settings/__tests__/fixtures"
import { countWords, rowName, watchlistHint } from "@/components/admin/cleanup/settings/protection-rows"
import {
  addCollections,
  draftErrors,
  draftOf,
  LIST_MAX,
  onCount,
  toProtections,
  withProtection,
} from "@/components/admin/cleanup/settings/protections-draft"
import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"

const options = buildOptions()

describe("protections draft", () => {
  it("copies the saved values, so an edit never changes them", () => {
    const draft = draftOf(options.protections)
    draft.g4.days = 7
    expect(options.protections.g4.days).toBe(30)
  })

  it("gives the options of a valid draft and the errors of each bad field", () => {
    const draft = withProtection(draftOf(options.protections), "g12", { days: null })
    expect(toProtections(draft)).toBeNull()
    const tags = Array.from({ length: LIST_MAX + 1 }, (_, i) => `tag-${i}`)
    const names = Array.from({ length: LIST_MAX + 1 }, (_, i) => `Collection ${i}`)
    const bad = withProtection(withProtection(draft, "g9", { tags }), "g13", { collections: names })
    expect(draftErrors(bad)).toEqual({
      "g12-days": "Enter a whole number of days from 1 to 3650.",
      "g9-tags": "Choose at most 20 tags.",
      "g13-collections": "Choose at most 20 collections.",
    })
    expect(toProtections(withProtection(draft, "g12", { days: 400 }))).toEqual({ ...options.protections, g12: { enabled: true, days: 400 } })
  })

  it("adds each Kometa collection once and turns G13 on", () => {
    const draft = withProtection(draftOf(options.protections), "g13", { collections: ["Christmas Movies"] })
    expect(addCollections(draft, ["Christmas Movies", "Halloween Movies"]).g13).toEqual({ enabled: true, collections: ["Christmas Movies", "Halloween Movies"] })
    expect(onCount(draftOf(options.protections))).toBe(12)
  })
})

describe("protection rows", () => {
  const protections = buildProtections(options)
  const byId = (id: string) => protections.find((p) => p.id === id)!

  it("words the count, Off, and the services a protection needs", () => {
    expect(countWords(byId("g4"), true, 212)).toBe("Protects 212 titles")
    expect(countWords(byId("g11"), true, 1)).toBe("Protects 1 season")
    expect(countWords(byId("g4"), false, 212)).toBe("Off")
    expect(countWords(byId("g4"), true, null)).toBeNull()
    expect(countWords({ ...byId("g9"), needsMissing: ["sonarr"] }, true, 3)).toBe("Protects 3 titles")
    expect(countWords({ ...byId("g7"), needsMissing: ["overseerr"] }, true, 3)).toBe("Needs Overseerr")
  })

  it("words the watchlist hint when no member uses watchlist sync", () => {
    expect(watchlistHint(0)).toBe("Known only for members who use watchlist sync, and no member uses it now. For other members this is unknown, not no.")
  })

  it("names each checkbox by the full sentence with the draft values", () => {
    const draft = withProtection(draftOf(options.protections), "g4", { days: null })
    expect(rowName(byId("g4"), draft, options.protections)).toBe("Played by anyone in the last 30 days")
    expect(rowName(byId("g9"), withProtection(draft, "g9", { tags: ["keep", "4k"] }), options.protections)).toBe("Has a Radarr or Sonarr tag: keep, 4k")
    expect(rowName(byId("g11"), draft, options.protections)).toBe("The newest season of a continuing show")
    expect(rowName(byId("g2"), draft, options.protections)).toBe("Marked Keep forever by a member")
  })
})
