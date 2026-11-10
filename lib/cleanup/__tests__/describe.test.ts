/** The plain words of a rule (UX 5.8, TS 4.4): every predicate template, scope, groups, protections, Then and the mode sentence. */

import { buildCondition, buildDefinition } from "@/lib/cleanup/__tests__/helpers/builders"
import { type DescribeContext, describeRule, MODE_SENTENCES, plainText, spacedParts } from "@/lib/cleanup/describe"
import { describeCondition } from "@/lib/cleanup/fields/catalog"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { GiB, type Level, TiB } from "@/lib/validations/cleanup-vocabulary"

const TITLES: Record<string, string> = { "1": "Movies", "2": "Kids Movies", "3": "TV Shows", "4": "Anime" }
const ctx: DescribeContext = {
  libraryTitle: (id) => TITLES[id] ?? null,
  memberName: (id) => (id === "u1" ? "Dana Whitfield" : null),
  mode: "dryRun",
}

const days = (amount: number, unit: "days" | "weeks" | "months" | "years" = "days") => ({ amount, unit })
const said = (c: Condition, level: Level, form: "plural" | "singular" = "plural") => describeCondition(c, level, ctx, form)

describe("describeRule", () => {
  it("gives the UX 5.8 example word for word for the rule of shots/04-editor.png", () => {
    const definition = buildDefinition({
      conditions: [
        buildCondition("library.added", { id: "c1", value: { duration: days(365) } }),
        buildCondition("watch.lastPlayed", { id: "c2" }),
        { id: "a1", kind: "anyOf", conditions: [buildCondition("request.exists", { id: "c3" }), buildCondition("request.by", { id: "c4" })] },
      ],
      protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 3, window: { kind: "total" } } })],
    })
    const parts = describeRule(definition, ctx)
    expect(plainText(parts)).toBe(
      "Movies in the Movies library that were added more than 365 days ago, had no play in the last 365 days, " +
        "and either have no request in Overseerr or were requested only by former members. Never touch anything " +
        "that a global protection keeps safe, or that has at least 3 plays in total. Keep matches in Leaving soon " +
        "for 30 days, then delete each movie and its files in Radarr, and add an import list exclusion. This rule " +
        "is in Dry run, so runs only record its matches.",
    )
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual([
      "Movies",
      "were added more than 365 days ago",
      "had no play in the last 365 days",
      "have no request in Overseerr",
      "were requested only by former members",
      "has at least 3 plays in total",
      "30 days",
    ])
    expect(parts[0]).toEqual({ text: "Movies in the " })

    // The rule card bolds only the values, with the same words (UX 4.1.3 item 1, UX review UX-13)
    const card = describeRule(definition, { ...ctx, valuesOnly: true })
    expect(plainText(card)).toBe(plainText(parts))
    expect(card.filter((p) => p.strong).map((p) => p.text)).toEqual(["Movies", "365 days", "365 days", "no", "former members", "3", "30 days"])
  })

  it("names the scope by level and libraries (TS 4.4 item 1)", () => {
    const scope = (level: Level, libraries: string[]) => plainText(describeRule(buildDefinition({ level, libraries }), ctx)).split(" that ")[0]
    expect(scope("movie", ["1", "2"])).toBe("Movies in the Movies and Kids Movies libraries")
    expect(scope("show", ["3"])).toBe("Whole shows in the TV Shows library")
    expect(scope("season", ["3", "4", "9"])).toBe("Seasons in the TV Shows, Anime and library 9 libraries")
    expect(scope("movie", [])).toBe("Movies")
  })

  it("joins conditions with commas and ', and', and groups as 'either'", () => {
    const sentence = (conditions: RuleDraft["conditions"]) => plainText(describeRule({ ...buildDefinition(), conditions }, { ...ctx, mode: null }))
    const a = buildCondition("library.added", { id: "c1" })
    const b = buildCondition("file.size", { id: "c2" })
    const c = buildCondition("request.exists", { id: "c3", value: { exists: true } })
    expect(sentence([a])).toMatch(/^Movies in the Movies library that were added more than 90 days ago\. Never touch/)
    expect(sentence([a, b])).toContain("that were added more than 90 days ago, and are larger than 20 GB. Never")
    expect(sentence([{ id: "a1", kind: "anyOf", conditions: [a, b] }])).toContain("that either were added more than 90 days ago or are larger than 20 GB.")
    expect(sentence([{ id: "a1", kind: "anyOf", conditions: [a, b, c] }])).toContain(
      "that either were added more than 90 days ago, are larger than 20 GB or have a request in Overseerr.",
    )
  })

  it("leaves out incomplete conditions, and a group with one complete condition reads as that condition", () => {
    const draft: RuleDraft = {
      ...buildDefinition(),
      conditions: [
        { id: "c1", field: "file.size", op: "moreThan", value: {} },
        { id: "a1", kind: "anyOf", conditions: [buildCondition("library.added", { id: "c2" }), { id: "c3", field: "watch.plays", op: "atLeast", value: null }] },
        { id: "a2", kind: "anyOf", conditions: [{ id: "c4", field: "request.by", op: "only", value: { requesters: [] } }] },
      ],
      protections: [{ id: "p1", field: "file.size", op: "lessThan", value: { bytes: 1 } }],
    }
    expect(plainText(describeRule(draft, ctx))).toBe(
      "Movies in the Movies library that were added more than 90 days ago. Never touch anything that a global protection keeps safe. " +
        "Keep matches in Leaving soon for 30 days, then delete each movie and its files in Radarr, and add an import list exclusion. " +
        "This rule is in Dry run, so runs only record its matches.",
    )
    const empty = { ...draft, conditions: [draft.conditions[0]] }
    expect(plainText(describeRule(empty, { ...ctx, mode: undefined }))).toMatch(/^Movies in the Movies library\. Never touch/)
  })

  it("joins protections with 'or', in the singular", () => {
    const definition = buildDefinition({
      protections: [
        buildCondition("library.added", { id: "p1", op: "lessThan", value: { duration: days(30) } }),
        buildCondition("request.exists", { id: "p2", value: { exists: true } }),
        buildCondition("file.size", { id: "p3", op: "lessThan", value: { bytes: 2 * GiB, unit: "GB" } }),
      ],
    })
    expect(plainText(describeRule(definition, ctx))).toContain(
      "Never touch anything that a global protection keeps safe, or that was added in the last 30 days or has a request in Overseerr or is smaller than 2 GB.",
    )
  })

  it("gives the Then phrase of each action, the exclusion only for delete actions, and none for a partial Then", () => {
    const then = (level: Level, t: RuleDraft["then"]) => plainText(describeRule({ ...buildDefinition({ level }), then: t }, { ...ctx, mode: null })).split("safe. ")[1]
    expect(then("movie", { graceDays: 1, action: "movie.delete", importListExclusion: false })).toBe(
      "Keep matches in Leaving soon for 1 day, then delete each movie and its files in Radarr.",
    )
    expect(then("movie", { graceDays: 14, action: "movie.unmonitorDeleteFiles", importListExclusion: true })).toBe(
      "Keep matches in Leaving soon for 14 days, then unmonitor each movie and delete its files in Radarr.",
    )
    expect(then("show", { graceDays: 30, action: "show.delete", importListExclusion: true })).toBe(
      "Keep matches in Leaving soon for 30 days, then delete each show and its files in Sonarr, and add an import list exclusion.",
    )
    expect(then("show", { graceDays: 30, action: "show.unmonitorDeleteFiles", importListExclusion: false })).toBe(
      "Keep matches in Leaving soon for 30 days, then unmonitor each show and delete its files in Sonarr.",
    )
    expect(then("season", { graceDays: 30, action: "season.unmonitorDeleteFiles" })).toBe(
      "Keep matches in Leaving soon for 30 days, then unmonitor each season and delete its files in Sonarr.",
    )
    expect(then("movie", { graceDays: 30 })).toBeUndefined()
    expect(then("movie", { action: "movie.delete" })).toBeUndefined()
  })

  it("ends with the mode sentence", () => {
    const end = (mode: DescribeContext["mode"]) => plainText(describeRule(buildDefinition(), { ...ctx, mode })).split("Radarr, and add an import list exclusion.")[1]
    expect(end("dryRun")).toBe(" This rule is in Dry run, so runs only record its matches.")
    expect(end("reviewFirst")).toBe(" At the leave date, items wait for your approval.")
    expect(end("automatic")).toBe(" At the leave date, items are deleted inside the daily budget.")
    expect(end(null)).toBe("")
    expect(Object.keys(MODE_SENTENCES)).toEqual(["dryRun", "reviewFirst", "automatic"])
  })
})

describe("predicate templates (UX 5.8)", () => {
  const lastPlayed = (op: "moreThan" | "lessThan" | "never", orNever = false) =>
    buildCondition("watch.lastPlayed", { op, value: { duration: days(6, "months"), orNever } })
  const plays = (op: "fewerThan" | "atLeast", count: number, last?: number) =>
    buildCondition("watch.plays", { op, value: { count, window: last ? { kind: "last", duration: days(last) } : { kind: "total" } } })

  it.each<[Condition, string, string]>([
    [lastPlayed("moreThan", true), "had no play in the last 6 months", "had no episode played in the last 6 months"],
    [lastPlayed("moreThan"), "were played, but not in the last 6 months", "had episodes played, but none in the last 6 months"],
    [lastPlayed("lessThan"), "were played in the last 6 months", "had an episode played in the last 6 months"],
    [lastPlayed("never"), "were never played", "never had an episode played"],
    [plays("fewerThan", 1), "have no counted play", "have no counted play"],
    [plays("fewerThan", 3), "have fewer than 3 plays", "have fewer than 3 plays"],
    [plays("fewerThan", 2, 365), "have fewer than 2 plays in the last 365 days", "have fewer than 2 plays in the last 365 days"],
    [plays("fewerThan", 1, 30), "have no counted play in the last 30 days", "have no counted play in the last 30 days"],
    [plays("atLeast", 3), "have at least 3 plays in total", "have at least 3 plays in total"],
    [plays("atLeast", 2, 90), "have at least 2 plays in the last 90 days", "have at least 2 plays in the last 90 days"],
    [plays("atLeast", 1), "have a counted play", "have a counted play"],
    [plays("atLeast", 1, 90), "have a counted play in the last 90 days", "have a counted play in the last 90 days"],
    [buildCondition("request.exists", { value: { exists: true } }), "have a request in Overseerr", "have a request in Overseerr"],
    [buildCondition("request.exists"), "have no request in Overseerr", "have no request in Overseerr"],
    [buildCondition("request.age"), "were last requested more than 120 days ago", "were last requested more than 120 days ago"],
    [buildCondition("request.age", { op: "lessThan", value: { duration: days(2, "weeks") } }), "were requested in the last 2 weeks", "were requested in the last 2 weeks"],
    [buildCondition("request.by", { op: "anyOf", value: { requesters: [{ kind: "anyMember" }] } }), "were requested by any member", "were requested by any member"],
    [buildCondition("request.by", { value: { requesters: [{ kind: "former" }, { kind: "member", userId: "u1" }, { kind: "member", userId: "u2" }] } }),
      "were requested only by former members, Dana Whitfield or Unknown member", "were requested only by former members, Dana Whitfield or Unknown member"],
    [buildCondition("request.by", { op: "noneOf", value: { requesters: [{ kind: "inactive", days: 90 }] } }),
      "were not requested by members inactive for 90 days", "were not requested by members inactive for 90 days"],
    [buildCondition("library.added"), "were added more than 90 days ago", "were added more than 90 days ago"],
    [buildCondition("library.added", { op: "lessThan", value: { duration: days(1, "years") } }), "were added in the last 1 year", "were added in the last 1 year"],
    [buildCondition("file.size"), "are larger than 20 GB", "are larger than 20 GB"],
    [buildCondition("file.size", { op: "lessThan", value: { bytes: 1.5 * TiB, unit: "TB" } }), "are smaller than 1.5 TB", "are smaller than 1.5 TB"],
    [buildCondition("show.lastEpisodeAdded"), "got no new episode in the last 365 days", "got no new episode in the last 365 days"],
    [buildCondition("show.lastEpisodeAdded", { op: "lessThan" }), "got a new episode in the last 365 days", "got a new episode in the last 365 days"],
  ])("reads %j for movies and for whole shows", (c, movies, shows) => {
    expect(said(c, "movie")).toBe(movies)
    expect(said(c, "show")).toBe(shows)
  })

  it.each<[Condition, string, string]>([
    [buildCondition("request.requesters"), "were never played by a requester", "were never played by a requester of the show"],
    [buildCondition("request.requesters", { value: { did: "allFinished" } }), "were finished by every requester, every episode on disk",
      "were finished by every requester of the show"],
    [buildCondition("show.status"), "are shows that ended", "are in a show that ended"],
    [buildCondition("show.status", { value: { status: "continuing" } }), "are still continuing", "are in a continuing show"],
    [buildCondition("show.seasonsOnDisk"), "have at least 3 seasons on disk", "are in a show with at least 3 seasons on disk"],
    [buildCondition("show.seasonsOnDisk", { op: "fewerThan", value: { count: 1 } }), "have fewer than 1 season on disk",
      "are in a show with fewer than 1 season on disk"],
    [buildCondition("season.position"), "are not one of the 2 newest seasons of their show", "are not one of the 2 newest seasons of their show"],
    [buildCondition("season.position", { value: { count: 1 } }), "are not the newest season of their show", "are not the newest season of their show"],
    [buildCondition("season.position", { op: "newest", value: { count: 3 } }), "are one of the 3 newest seasons of their show",
      "are one of the 3 newest seasons of their show"],
    [buildCondition("season.position", { op: "newest", value: { count: 1 } }), "are the newest season of their show", "are the newest season of their show"],
  ])("reads %j for whole shows and for seasons", (c, shows, seasons) => {
    expect(said(c, "show")).toBe(shows)
    expect(said(c, "season")).toBe(seasons)
  })

  it("reads The requesters for movies", () => {
    expect(said(buildCondition("request.requesters", { value: { did: "allFinished" } }), "movie")).toBe("were finished by every requester")
  })

  it("uses the singular verb for a protection (TS 4.4 item 6)", () => {
    expect(said(lastPlayed("lessThan"), "movie", "singular")).toBe("was played in the last 6 months")
    expect(said(lastPlayed("never"), "movie", "singular")).toBe("was never played")
    expect(said(lastPlayed("moreThan"), "movie", "singular")).toBe("was played, but not in the last 6 months")
    expect(said(plays("atLeast", 3), "show", "singular")).toBe("has at least 3 plays in total")
    expect(said(buildCondition("request.age"), "movie", "singular")).toBe("was last requested more than 120 days ago")
    expect(said(buildCondition("request.by"), "movie", "singular")).toBe("was requested only by former members")
    expect(said(buildCondition("request.requesters"), "season", "singular")).toBe("was never played by a requester of the show")
    expect(said(buildCondition("file.size"), "movie", "singular")).toBe("is larger than 20 GB")
    expect(said(buildCondition("show.status"), "show", "singular")).toBe("is a show that ended")
    expect(said(buildCondition("show.status", { value: { status: "continuing" } }), "show", "singular")).toBe("is still continuing")
    expect(said(buildCondition("show.status"), "season", "singular")).toBe("is in a show that ended")
    expect(said(buildCondition("show.seasonsOnDisk"), "show", "singular")).toBe("has at least 3 seasons on disk")
    expect(said(buildCondition("season.position"), "season", "singular")).toBe("is not one of the 2 newest seasons of its show")
    expect(said(buildCondition("show.lastEpisodeAdded"), "show", "singular")).toBe("got no new episode in the last 365 days")
  })
})

describe("spacedParts (UX review UX-01)", () => {
  it("puts one space between two sentence parts, and none inside a sentence or before a part that has one", () => {
    const facts = [{ text: "Never played." }, { text: "No counted play since Tautulli history starts on Oct 11, 2024." }]
    expect(plainText(facts)).toBe("Never played. No counted play since Tautulli history starts on Oct 11, 2024.")
    expect(spacedParts([{ text: "Last played " }, { text: "Mar 2024", strong: true }, { text: "." }, { text: " Added Aug 2025." }]))
      .toEqual([{ text: "Last played " }, { text: "Mar 2024", strong: true }, { text: "." }, { text: " Added Aug 2025." }])
    expect(spacedParts([{ text: "Size 4.5 GB?" }, { text: "Yes!", strong: true }, { text: "Done" }]))
      .toEqual([{ text: "Size 4.5 GB?" }, { text: " Yes!", strong: true }, { text: " Done" }])
  })
})
