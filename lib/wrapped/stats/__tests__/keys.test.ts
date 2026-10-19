/**
 * @jest-environment node
 */

/**
 * Title identity, the rounding rule and listing (P2.7: RWP-07).
 */

import { displayTitles, isListed, minutesOf, titleKey, videoEvents } from "@/lib/wrapped/stats/keys"

import { play, statsContext } from "./build-events"

const zone = "UTC"

describe("titleKey", () => {
  it("keys films by rating key and episodes by their series", () => {
    expect(titleKey(play({ at: "2026-02-01T20:00", zone, film: "101" }))).toBe("film:101")
    expect(titleKey(play({ at: "2026-02-01T20:00", zone, series: "77" }))).toBe("series:77")
  })

  it("gives tracks and other media no key, so no stat reads them", () => {
    const track = play({ at: "2026-02-01T20:00", zone, film: "5", mediaType: "track" })
    const clip = play({ at: "2026-02-01T20:00", zone, film: "6", mediaType: "other" })
    expect(titleKey(track)).toBeNull()
    expect(videoEvents([track, clip, play({ at: "2026-02-01T20:00", zone, film: "7" })])).toHaveLength(1)
  })
})

describe("minutesOf", () => {
  it("floors a sum once", () => {
    expect(minutesOf(50 + 50 + 50)).toBe(2)
    expect(minutesOf(59)).toBe(0)
  })
})

describe("isListed", () => {
  it("leaves out a hidden film and every episode of a hidden series", () => {
    const ctx = statsContext(zone, { hidden: ["101", "77"] })
    const [film, episode, other] = videoEvents([
      play({ at: "2026-02-01T20:00", zone, film: "101" }),
      play({ at: "2026-02-01T20:00", zone, series: "77" }),
      play({ at: "2026-02-01T20:00", zone, film: "102" }),
    ])
    expect([isListed(film, ctx), isListed(episode, ctx), isListed(other, ctx)]).toEqual([false, false, true])
  })

  it("leaves out a play the content-rating exclusions kept out of lists (FR-44)", () => {
    const [excluded] = videoEvents([{ ...play({ at: "2026-02-01T20:00", zone, film: "103" }), excludedFromLists: true }])
    expect(isListed(excluded, statsContext(zone))).toBe(false)
  })
})

describe("displayTitles", () => {
  it("adds the year only where two keys share a title", () => {
    const titles = displayTitles([
      { key: "film:1", title: "Dune", year: 1984 },
      { key: "film:2", title: "Dune", year: 2021 },
      { key: "film:3", title: "Arrival", year: 2016 },
    ])
    expect([...titles.values()]).toEqual(["Dune (1984)", "Dune (2021)", "Arrival"])
  })
})
