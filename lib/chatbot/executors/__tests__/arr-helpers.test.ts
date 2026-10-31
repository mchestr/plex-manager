/**
 * The Sonarr and Radarr tools' shared helpers: arguments read defensively,
 * replies cut to a count and a character budget with a "showing" line, title
 * matching, and the shared projections.
 */

import { z } from "zod"

import { calendarRange, optionalText, optionalWhole, textArg, wholeArg, wholeOrNone } from "../arr-args"
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

  it("tells an optional id left out from one given that cannot be read", () => {
    expect(optionalWhole({ seriesId: "12" }, "seriesId")).toEqual({ value: 12 })
    expect(optionalWhole({ seasonNumber: 0 }, "seasonNumber", 0)).toEqual({ value: 0 })
    for (const left of [{}, { seriesId: null }, { seriesId: " " }]) expect(optionalWhole(left, "seriesId")).toEqual({})
    for (const seriesId of [0, -1, 1.5, "twelve", true]) {
      expect(optionalWhole({ seriesId }, "seriesId")).toEqual({ error: "Error: 'seriesId' must be a whole number of at least 1, or left out" })
    }
    expect(optionalWhole({ seasonNumber: -1 }, "seasonNumber", 0)).toEqual({ error: "Error: 'seasonNumber' must be a whole number of at least 0, or left out" })
  })

  it("reads an optional title, a number as text, and refuses anything else", () => {
    expect(optionalText({ seriesName: " Severance " }, "seriesName")).toEqual({ value: "Severance" })
    expect(optionalText({ seriesName: 1883 }, "seriesName")).toEqual({ value: "1883" })
    expect(optionalText({ seriesName: null }, "seriesName")).toEqual({})
    expect(optionalText({ seriesName: { title: "Severance" } }, "seriesName")).toEqual({ error: "Error: 'seriesName' must be text, or left out" })
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

  it("filters to one season of a series, by the record's own season or its episode's", () => {
    const records = [
      { title: "a", seriesId: 1, seasonNumber: 2 },
      { title: "b", seriesId: 1, episode: { seasonNumber: 2 } },
      { title: "c", seriesId: 1, seasonNumber: 3 },
      { title: "d", seriesId: 9, seasonNumber: 2 },
    ]

    const output = JSON.parse(arrPageOutput({ success: true, data: { records, totalRecords: 4 } }, { project: titled, limit: 50 }, { key: "seriesId", id: 1, season: 2 }))

    expect(output.records).toEqual([{ title: "a" }, { title: "b" }])
    expect(output.showing).toBe("showing 2 for this title, from the latest 4 of 4")
  })

  it("says how to see more of a filtered reply when matches may lie past the records read, if asked to", () => {
    const records = [{ title: "a", seriesId: 1 }]
    const reply = { project: titled, limit: 50, more: "list its episodes" }
    const filter = { key: "seriesId", id: 1 }

    expect(JSON.parse(arrPageOutput({ success: true, data: { records, totalRecords: 900 } }, { ...reply, morePastRead: true }, filter)).showing).toBe(
      "showing 1 for this title, from the latest 1 of 900; list its episodes"
    )
    expect(JSON.parse(arrPageOutput({ success: true, data: { records, totalRecords: 900 } }, reply, filter)).showing).toBe("showing 1 for this title, from the latest 1 of 900")
    expect(JSON.parse(arrPageOutput({ success: true, data: { records, totalRecords: 1 } }, { ...reply, morePastRead: true }, filter)).showing).toBe("showing 1 for this title, from the latest 1 of 1")
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

  const queueItem = (statusMessages: unknown, errorMessage?: string) => z.object(queueFields).parse({ title: "Show.S01.1080p.WEB-DL", statusMessages, errorMessage })

  it("reads a blocked import as Sonarr sends it: the summary title, then each file's name and errors", () => {
    // CompletedDownloadService: a summary with no messages, then one entry per file not imported
    const item = queueItem([
      { title: "One or more episodes expected in this release were not imported or missing from the release", messages: [] },
      { title: "Show.S01E03.1080p.WEB-DL.mkv", messages: ["Not an upgrade for existing episode file(s)", "Sample"] },
      { title: "Show.S01E05.1080p.WEB-DL.mkv", messages: ["Sample"] },
      { title: "Show.S01E05.1080p.WEB-DL.mkv", messages: ["Sample"] },
    ])

    expect(queueOf(item).statusMessage).toBe(
      "One or more episodes expected in this release were not imported or missing from the release | Show.S01E03.1080p.WEB-DL.mkv: Not an upgrade for existing episode file(s); Sample | Show.S01E05.1080p.WEB-DL.mkv: Sample"
    )
  })

  it("keeps the reason when the summary is the only entry (a pack missing an episode)", () => {
    const item = queueItem([{ title: "One or more episodes expected in this release were not imported or missing from the release", messages: [] }])

    expect(queueOf(item).statusMessage).toBe("One or more episodes expected in this release were not imported or missing from the release")
  })

  it("gives a warning titled with the release as its message alone, and nothing for empty entries", () => {
    const item = queueItem([{ title: "Show.S01.1080p.WEB-DL", messages: ["No files found are eligible for import in /data/downloads/tv/Show.S01.1080p.WEB-DL"] }, { messages: [] }, {}])

    expect(queueOf(item).statusMessage).toBe("No files found are eligible for import in /data/downloads/tv/Show.S01.1080p.WEB-DL")
    expect(queueOf(queueItem([{ title: "Show.S01.1080p.WEB-DL", messages: [] }])).statusMessage).toBeUndefined()
  })

  it("clips the line to 300 characters", () => {
    const { statusMessage } = queueOf(queueItem([{ title: "file 1", messages: ["x".repeat(400)] }]))

    expect(statusMessage).toMatch(/^file 1: x+…$/)
    expect(statusMessage).toHaveLength(300)
  })

  it("cuts every absolute path in the messages to its last part when pathless (Discord), and only then", () => {
    const messages = [
      "No files found are eligible for import in /data/downloads/complete/tv/Show.S01",
      "[C:\\Downloads\\Complete\\Show.S02] is not a valid local path. You may need a Remote Path Mapping.",
      "Couldn't read \\\\nas\\media\\tv\\Show (US)\\Season 1, see https://wiki.servarr.com/sonarr/faq and/or retry",
    ]
    const item = queueItem([{ title: "Show.S01.1080p.WEB-DL", messages }], "Error: [Errno 2] No such file or directory: '/downloads/incomplete/Show.S01'")

    const discord = queueOf(item, true)

    expect(discord.statusMessage).toBe(
      "No files found are eligible for import in …/Show.S01; […/Show.S02] is not a valid local path. You may need a Remote Path Mapping.; Couldn't read …/Show (US)\\Season 1, see https://wiki.servarr.com/sonarr/faq and/or retry"
    )
    expect(discord.errorMessage).toBe("Error: [Errno 2] No such file or directory: '…/Show.S01'")
    expect(queueOf(item).statusMessage).toContain("/data/downloads/complete/tv/Show.S01")
    expect(queueOf(item).errorMessage).toContain("/downloads/incomplete/Show.S01")
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
