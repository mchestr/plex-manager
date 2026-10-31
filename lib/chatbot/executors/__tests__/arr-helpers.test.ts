/**
 * The Sonarr and Radarr tools' shared helpers: arguments read defensively,
 * replies cut to a count and a character budget with a "showing" line, title
 * matching, and the shared projections.
 */

import { z } from "zod"

import { calendarRange, textArg, wholeArg, wholeOrNone } from "../arr-args"
import { arrLocalPage, arrPageOutput, arrSearchOutput, idForTitle, orElse, titleMatches } from "../arr-output"
import { clip, day, queueFields, queueOf, qualityProfile, rootFolder, trimDetails } from "../arr-projections"

describe("arguments from a model", () => {
  it("reads a whole number from a number or numeric string, clamped, else the fallback", () => {
    expect(wholeArg(30, 20, 50)).toBe(30)
    expect(wholeArg("30", 20, 50)).toBe(30)
    expect(wholeArg(12.9, 20, 50)).toBe(12)
    expect(wholeArg(500, 20, 50)).toBe(50)
    expect(wholeArg(-3, 20, 50)).toBe(1)
    expect(wholeArg("twenty", 20, 50)).toBe(20)
    expect(wholeArg(undefined, 20, 50)).toBe(20)
    expect(wholeArg(Number.NaN, 20, 50)).toBe(20)
  })

  it("reads an id or season, or nothing", () => {
    expect(wholeOrNone(12)).toBe(12)
    expect(wholeOrNone(" 12 ")).toBe(12)
    expect(wholeOrNone(0)).toBeUndefined()
    expect(wholeOrNone(0, 0)).toBe(0)
    expect(wholeOrNone(1.5)).toBeUndefined()
    expect(wholeOrNone("12abc")).toBeUndefined()
    expect(wholeOrNone(null)).toBeUndefined()
  })

  it("reads trimmed text, or nothing when blank", () => {
    expect(textArg("  Severance ")).toBe("Severance")
    expect(textArg("   ")).toBeUndefined()
    expect(textArg(42)).toBeUndefined()
    expect(textArg("x".repeat(300))).toHaveLength(100)
  })

  it("ends the calendar 7 days after the start, or after now, unless an end is given", () => {
    const now = Date.parse("2026-10-31T23:30:00Z")
    expect(calendarRange({ startDate: "2026-12-30" }, now)).toEqual({ start: "2026-12-30", end: "2027-01-06" })
    expect(calendarRange({}, now)).toEqual({ start: undefined, end: "2026-11-07" })
    expect(calendarRange({ startDate: "2026-11-01", endDate: "2026-11-03" }, now)).toEqual({ start: "2026-11-01", end: "2026-11-03" })
  })

  it("leaves the end to the server when the start is not a date it can extend", () => {
    expect(calendarRange({ startDate: "next week" })).toEqual({ start: "next week", end: undefined })
    expect(calendarRange({ startDate: "+275760-09-13T00:00:00Z" })).toEqual({ start: "+275760-09-13T00:00:00Z", end: undefined })
  })
})

describe("replies", () => {
  const titled = z.object({ title: z.string() })

  it("cuts a page that would not fit in a tool result, and says so", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ title: `${i} ${"x".repeat(2000)}` }))

    const reply = arrLocalPage({ items, page: 1, pageSize: 50, what: "series, sorted by title" })

    expect(reply.records.length).toBeLessThan(50)
    expect(JSON.stringify(reply).length).toBeLessThanOrEqual(40_000)
    expect(reply.showing).toBe(`showing ${reply.records.length} of 50 series, sorted by title; only ${reply.records.length} of this page fit in one reply: pass a smaller pageSize`)
  })

  it("cuts a server page to the budget too", () => {
    const records = Array.from({ length: 50 }, () => ({ title: "y".repeat(2000) }))

    const output = arrPageOutput({ success: true, data: { records, totalRecords: 900 } }, { project: titled, limit: 50, more: "pass a series" })

    expect(output.length).toBeLessThanOrEqual(40_000)
    expect(JSON.parse(output).showing).toMatch(/^showing 1\d of 900; pass a series$/)
  })

  it("skips records that are not objects, and passes an error through", () => {
    const output = JSON.parse(arrPageOutput({ success: true, data: { records: ["r".repeat(2000), { title: "Heat" }], totalRecords: 2 } }, { project: titled, limit: 20 }))

    expect(output).toEqual({ showing: "showing 1 of 2", totalRecords: 2, records: [{ title: "Heat" }] })
    expect(JSON.parse(arrPageOutput({ success: false, error: "Sonarr timed out" }, { project: titled, limit: 20 }))).toEqual({ error: "Sonarr timed out" })
  })

  it("shows every search result it found without a hint when there are ten or fewer", () => {
    expect(JSON.parse(arrSearchOutput([{ title: "Heat" }], "heat", "tmdb:<tmdbId>"))).toEqual({ showing: 'showing 1 of 1 results for "heat"', totalRecords: 1, records: [{ title: "Heat" }] })
  })

  it("joins only the ways to see more that apply", () => {
    expect(orElse("pass a pageSize up to 50", false, undefined, "pass a series")).toBe("pass a pageSize up to 50, or pass a series")
    expect(orElse(false, "")).toBeUndefined()
  })
})

describe("titles", () => {
  it("matches ignoring case and punctuation", () => {
    expect(titleMatches("Marvel's Agents of S.H.I.E.L.D.", "agents of shield")).toBe(true)
    expect(titleMatches("Law & Order: SVU", "law & order")).toBe(true)
    expect(titleMatches("Heat", "!!!")).toBe(false)
    expect(titleMatches(undefined, "heat")).toBe(false)
  })

  it("prefers the exact title, then a title or slug that contains the name", () => {
    const library = [
      { id: 1, title: "The Office Christmas Special", titleSlug: "the-office-christmas-special" },
      { id: 2, title: "The Office", titleSlug: "the-office-us" },
      { id: 3, title: "Office Space", titleSlug: "office-space-1999" },
    ]
    expect(idForTitle(library, " the office ")).toBe(2)
    expect(idForTitle(library, "office-us")).toBe(2)
    expect(idForTitle(library, "office")).toBe(1)
    expect(idForTitle(library, "  ")).toBeUndefined()
    expect(idForTitle({ records: library }, "the office")).toBeUndefined()
  })
})

describe("shared projections", () => {
  it("clips long text and keeps release dates as days", () => {
    expect(clip("abcdef", 4)).toBe("abc…")
    expect(clip("abcd", 4)).toBe("abcd")
    expect(day("2027-01-16T00:00:00Z")).toBe("2027-01-16")
    expect(day("2027-01-16")).toBe("2027-01-16")
  })

  it("joins a queue item's distinct status messages into one clipped line", () => {
    const item = z.object(queueFields).parse({
      title: "Release",
      statusMessages: [
        { title: "file 1", messages: ["Sample", "Not an upgrade"] },
        { title: "file 2", messages: ["Sample", "x".repeat(400)] },
      ],
    })

    const { statusMessage } = queueOf(item)

    expect(statusMessage).toMatch(/^Sample \| Not an upgrade \| x+…$/)
    expect(statusMessage).toHaveLength(300)
  })

  it("names a quality profile's cutoff, or keeps its id when no item has it", () => {
    const profile = { id: 4, name: "Any", upgradeAllowed: false, cutoff: 99, items: [{ quality: { id: 1, name: "SDTV" }, items: [], allowed: true }, { id: 1001, name: "Empty group", items: [], allowed: true }] }

    expect(qualityProfile.parse(profile)).toEqual({ id: 4, name: "Any", upgradeAllowed: false, cutoff: 99, allowed: ["SDTV"] })
    expect(qualityProfile.parse({ id: 5, name: "Broken", items: "none" })).toEqual({ id: 5, name: "Broken", upgradeAllowed: undefined, cutoff: undefined, allowed: [] })
  })

  it("counts no unmapped folders when a root folder lists none", () => {
    expect(rootFolder.parse({ id: 1, path: "/tv/", accessible: true })).toEqual({ id: 1, path: "/tv/", accessible: true, unmappedFolderCount: 0 })
  })

  it("drops images at any depth and trims alternate titles, leaving everything else", () => {
    const details = {
      title: "Heat",
      images: [{ url: "/poster.jpg" }],
      alternateTitles: [{ title: "Heat (1995)" }],
      genres: ["Crime"],
      seasons: [{ seasonNumber: 1, images: [{ url: "/s1.jpg" }], statistics: { sizeOnDisk: 1 } }],
      series: { alternateTitles: Array.from({ length: 7 }, (_, i) => ({ title: `Alias ${i}` })) },
    }

    expect(trimDetails(details)).toEqual({
      title: "Heat",
      alternateTitles: [{ title: "Heat (1995)" }],
      genres: ["Crime"],
      seasons: [{ seasonNumber: 1, statistics: { sizeOnDisk: 1 } }],
      series: { alternateTitles: Array.from({ length: 5 }, (_, i) => ({ title: `Alias ${i}` })), alternateTitleCount: 7 },
    })
  })
})
