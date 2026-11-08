/** The field catalogue (TS 4.1, 4.2, UX 6): labels, groups, defaults, presets, buckets, needs and disabled reasons. */

import { buildCondition } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  anyFieldMeta,
  describeCondition,
  FIELD_CATALOG,
  FIELD_GROUP_LABELS,
  FIELD_GROUPS,
  fieldDisabledReason,
  fieldMeta,
  fieldsOfGroup,
  notApplicableMessage,
  withPreset,
} from "@/lib/cleanup/fields/catalog"
import { conditionSchema } from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, FIELD_LEVELS, FIELD_NEEDS, FIELD_SOURCES, GiB, LEVELS, type Level, type Service } from "@/lib/validations/cleanup-vocabulary"

const labelsAt = (level: Level) => FIELD_IDS.filter((id) => FIELD_LEVELS[id].includes(level)).map((id) => fieldMeta(id).label(level))

describe("FIELD_CATALOG", () => {
  it("has one entry for each field, keyed by its id", () => {
    expect(Object.keys(FIELD_CATALOG)).toEqual([...FIELD_IDS])
    for (const id of FIELD_IDS) expect(FIELD_CATALOG[id].id).toBe(id)
    expect(anyFieldMeta("file.size")).toBe(FIELD_CATALOG["file.size"])
  })

  it("gives the picker and Why labels by level (TS 4.2, UX 6)", () => {
    expect(labelsAt("movie")).toEqual([
      "Last played", "Plays", "Requested in Overseerr", "Requested", "Requested by", "The requesters", "Added", "Size on disk",
    ])
    expect(labelsAt("show")).toEqual([
      "Last played (any episode)", "Plays", "Requested in Overseerr", "Requested", "Requested by", "The requesters", "Added",
      "Size on disk", "Show status", "Last episode added", "Seasons on disk",
    ])
    expect(labelsAt("season")).toEqual([
      "Last played (any episode of the season)", "Plays", "Requested in Overseerr", "Requested", "Requested by", "The requesters",
      "Added", "Size on disk", "Show status", "Last episode added", "Seasons on disk (whole show)", "Season position",
    ])
  })

  it("gives the row tokens: Size for file.size, else the base label", () => {
    expect(FIELD_IDS.map((id) => fieldMeta(id).token)).toEqual([
      "Last played", "Plays", "Requested in Overseerr", "Requested", "Requested by", "The requesters", "Added", "Size",
      "Show status", "Last episode added", "Seasons on disk", "Season position",
    ])
  })

  it("groups the fields in picker order", () => {
    expect(FIELD_GROUPS.map((g) => FIELD_GROUP_LABELS[g])).toEqual(["Watching", "Requests", "Library", "Shows and seasons"])
    expect(FIELD_GROUPS.map((g) => fieldsOfGroup(g).map((m) => m.id))).toEqual([
      ["watch.lastPlayed", "watch.plays"],
      ["request.exists", "request.age", "request.by", "request.requesters"],
      ["library.added", "file.size"],
      ["show.status", "show.lastEpisodeAdded", "show.seasonsOnDisk", "season.position"],
    ])
  })

  it("reads levels, sources and needs from the vocabulary (D3)", () => {
    for (const id of FIELD_IDS) {
      const meta = fieldMeta(id)
      expect(meta.levels).toBe(FIELD_LEVELS[id])
      expect(meta.needs).toBe(FIELD_NEEDS[id])
      for (const level of LEVELS) expect(meta.sources(level)).toBe(FIELD_SOURCES[id][level])
    }
  })

  it("holds the help text of UX 6, with X1 for Last episode added", () => {
    expect(fieldMeta("show.lastEpisodeAdded").help).toBe("When the newest episode arrived in Plex.")
    expect(fieldMeta("watch.lastPlayed").help).toBe("The newest counted play by anyone, from Tautulli. A play counts after 2 minutes or 90 %.")
    expect(fieldMeta("request.by").help).toBe("Members who made a request. Matched by Plex account, never by name.")
    expect(fieldMeta("season.position").help).toBe(
      "Uses Sonarr's season numbers. A season with no number never matches. A show whose Plex and Sonarr season numbers differ is Cannot delete for every season.",
    )
    for (const id of FIELD_IDS) expect(fieldMeta(id).help).toMatch(/^[A-Z].*\.$/)
  })

  it("gives the row help of Last played and Added only", () => {
    const ctx = { historyStart: "2022-06-14", level: "movie" as const }
    expect(fieldMeta("watch.lastPlayed").rowHelp?.(ctx)).toBe("Never means no counted play since Tautulli history starts on Jun 14, 2022.")
    expect(fieldMeta("watch.lastPlayed").rowHelp?.({ ...ctx, historyStart: "2022-06-14T03:00:00.000Z", zone: "UTC" })).toContain("Jun 14, 2022.")
    expect(fieldMeta("watch.lastPlayed").rowHelp?.({ ...ctx, historyStart: null })).toBeNull()
    expect(fieldMeta("library.added").rowHelp?.(ctx)).toBe(fieldMeta("library.added").help)
    expect(FIELD_IDS.filter((id) => fieldMeta(id).rowHelp)).toEqual(["watch.lastPlayed", "library.added"])
  })

  it("labels the operators in plain words", () => {
    expect(FIELD_IDS.map((id) => fieldMeta(id).operators.map((op) => fieldMeta(id).operatorLabels[op] ?? "(none)"))).toEqual([
      ["More than", "Less than", "Never"],
      ["Fewer than", "At least"],
      ["(none)"],
      ["More than", "Less than"],
      ["Any of", "Only", "None of"],
      ["(none)"],
      ["More than", "Less than"],
      ["More than", "Less than"],
      ["(none)"],
      ["More than", "Less than"],
      ["At least", "Fewer than"],
      ["Not one of the newest", "One of the newest"],
    ])
  })
})

describe("describe", () => {
  it("gives the plural predicate of every operator, as describeCondition does by default", () => {
    const words = { memberName: () => null }
    for (const id of FIELD_IDS) {
      const meta = anyFieldMeta(id)
      for (const op of meta.operators) {
        for (const level of LEVELS) {
          const c = conditionSchema.parse({ id: "c1", field: id, ...meta.defaultCondition(level), op })
          const said = describeCondition(c, level, words)
          expect(said).toBe(describeCondition(c, level, words, "plural"))
          expect(said).toMatch(/^[a-z]/)
          expect(said).not.toMatch(/\.$/)
        }
      }
    }
    expect(fieldMeta("request.exists").describe(buildCondition("request.exists"), "movie", words)).toBe("have no request in Overseerr")
    expect(fieldMeta("watch.lastPlayed").describe(buildCondition("watch.lastPlayed"), "show", words)).toBe("had no episode played in the last 365 days")
    expect(fieldMeta("watch.plays").describe(buildCondition("watch.plays"), "movie", words)).toBe("have no counted play")
    expect(fieldMeta("request.by").describe(buildCondition("request.by"), "movie", words)).toBe("were requested only by former members")
    expect(fieldMeta("request.requesters").describe(buildCondition("request.requesters"), "movie", words)).toBe("were never played by a requester")
    expect(fieldMeta("request.age").describe(buildCondition("request.age"), "movie", words)).toBe("were last requested more than 120 days ago")
    expect(fieldMeta("library.added").describe(buildCondition("library.added"), "movie", words)).toBe("were added more than 90 days ago")
    expect(fieldMeta("show.lastEpisodeAdded").describe(buildCondition("show.lastEpisodeAdded"), "show", words)).toBe("got no new episode in the last 365 days")
    expect(fieldMeta("file.size").describe(buildCondition("file.size"), "movie", words)).toBe("are larger than 20 GB")
    expect(fieldMeta("show.status").describe(buildCondition("show.status"), "show", words)).toBe("are shows that ended")
    expect(fieldMeta("show.seasonsOnDisk").describe(buildCondition("show.seasonsOnDisk"), "show", words)).toBe("have at least 3 seasons on disk")
    expect(fieldMeta("season.position").describe(buildCondition("season.position"), "season", words)).toBe("are not one of the 2 newest seasons of their show")
  })
})

describe("defaultCondition", () => {
  it("gives the default row of TS 4.2, which the condition schema accepts at every level", () => {
    for (const id of FIELD_IDS) {
      for (const level of LEVELS) {
        const row = { id: "c1", field: id, ...fieldMeta(id).defaultCondition(level) }
        expect(conditionSchema.safeParse(row).success).toBe(true)
        if (id !== "file.size") expect(row).toEqual(buildCondition(id))
      }
    }
  })

  it("gives the size default by level: Movies 20 GB, Shows 100 GB, Seasons 25 GB", () => {
    expect(LEVELS.map((level) => fieldMeta("file.size").defaultCondition(level).value)).toEqual([
      { bytes: 20 * GiB, unit: "GB" },
      { bytes: 100 * GiB, unit: "GB" },
      { bytes: 25 * GiB, unit: "GB" },
    ])
  })
})

describe("presets", () => {
  const labels = (id: (typeof FIELD_IDS)[number], level: Level) => fieldMeta(id).presets(level).map((p) => p.label)

  it("gives the chips of TS 4.2 by level", () => {
    for (const id of ["watch.lastPlayed", "request.age", "library.added", "show.lastEpisodeAdded"] as const) {
      expect(labels(id, "movie")).toEqual(["90 days", "180 days", "365 days", "2 years"])
    }
    expect(fieldMeta("library.added").presets("show")[3].value).toEqual({ amount: 2, unit: "years" })
    expect(labels("watch.plays", "movie")).toEqual(["1", "2", "3"])
    expect(LEVELS.map((level) => labels("file.size", level))).toEqual([
      ["10 GB", "20 GB", "50 GB"],
      ["50 GB", "100 GB", "250 GB"],
      ["10 GB", "25 GB", "50 GB"],
    ])
    expect(fieldMeta("file.size").presets("season").map((p) => p.value)).toEqual([10 * GiB, 25 * GiB, 50 * GiB])
    expect(labels("show.seasonsOnDisk", "show")).toEqual(["2", "3", "4", "5"])
    expect(labels("season.position", "season")).toEqual(["1", "2", "3", "4"])
    for (const id of ["request.exists", "request.by", "request.requesters", "show.status"] as const) expect(labels(id, "show")).toEqual([])
  })

  it("puts a chip's value on the main control, and ignores a value that does not fit", () => {
    const lastPlayed = buildCondition("watch.lastPlayed")
    expect(withPreset(lastPlayed, { amount: 2, unit: "years" })).toEqual({ ...lastPlayed, value: { duration: { amount: 2, unit: "years" }, orNever: true } })
    expect(withPreset(lastPlayed, { amount: 11, unit: "years" })).toBe(lastPlayed)
    for (const id of ["library.added", "request.age", "show.lastEpisodeAdded"] as const) {
      const dated = buildCondition(id)
      expect(withPreset(dated, { amount: 180, unit: "days" })).toEqual({ ...dated, value: { duration: { amount: 180, unit: "days" } } })
      expect(withPreset(dated, 3)).toBe(dated)
    }
    const plays = buildCondition("watch.plays")
    expect(withPreset(plays, 3)).toEqual({ ...plays, value: { count: 3, window: { kind: "total" } } })
    expect(withPreset(plays, "3")).toBe(plays)
    const size = buildCondition("file.size", { value: { bytes: 2 * GiB * 1024, unit: "TB" } })
    expect(withPreset(size, 50 * GiB)).toEqual({ ...size, value: { bytes: 50 * GiB, unit: "GB" } })
    expect(withPreset(size, 10)).toBe(size)
    expect(withPreset(buildCondition("show.seasonsOnDisk"), 5).value).toEqual({ count: 5 })
    expect(withPreset(buildCondition("show.seasonsOnDisk"), 0).value).toEqual({ count: 3 })
    expect(withPreset(buildCondition("season.position"), 4).value).toEqual({ count: 4 })
    expect(withPreset(buildCondition("season.position"), 21).value).toEqual({ count: 2 })
    for (const id of ["request.exists", "request.by", "request.requesters", "show.status"] as const) {
      const c = buildCondition(id)
      expect(withPreset(c, 1)).toBe(c)
    }
  })
})

describe("histogram", () => {
  const DAY_LABELS = ["Last 30 days", "1 to 3 months", "3 to 6 months", "6 to 12 months", "1 to 2 years", "2 years or more"]

  it("gives six date buckets with the edges 30, 91, 182, 365 and 730 days, and Never for Last played", () => {
    const buckets = fieldMeta("request.age").histogram?.("movie") ?? []
    expect(buckets.map((b) => b.label)).toEqual(DAY_LABELS)
    expect(buckets.map((b) => [b.from, b.to])).toEqual([[null, 30], [30, 91], [91, 182], [182, 365], [365, 730], [730, null]])
    const lastPlayed = fieldMeta("watch.lastPlayed").histogram?.("season") ?? []
    expect(lastPlayed.map((b) => b.label)).toEqual([...DAY_LABELS, "Never"])
    expect(lastPlayed[6]).toEqual({ label: "Never", from: null, to: null, never: true })
    expect(fieldMeta("show.lastEpisodeAdded").histogram?.("show")).toHaveLength(6)
    expect(fieldMeta("library.added").histogram?.("show")).toHaveLength(6)
  })

  it("gives the size buckets by level, in bytes", () => {
    const size = (level: Level) => fieldMeta("file.size").histogram?.(level) ?? []
    expect(size("movie").map((b) => b.label)).toEqual(["Under 2 GB", "2 to 5 GB", "5 to 10 GB", "10 to 20 GB", "20 to 40 GB", "40 GB or more"])
    expect(size("show").map((b) => b.label)).toEqual(["Under 25 GB", "25 to 50 GB", "50 to 100 GB", "100 to 250 GB", "250 to 500 GB", "500 GB or more"])
    expect(size("season").map((b) => b.label)).toEqual(["Under 5 GB", "5 to 10 GB", "10 to 25 GB", "25 to 50 GB", "50 GB or more"])
    expect(size("movie").map((b) => [b.from, b.to])).toEqual([
      [null, 2 * GiB], [2 * GiB, 5 * GiB], [5 * GiB, 10 * GiB], [10 * GiB, 20 * GiB], [20 * GiB, 40 * GiB], [40 * GiB, null],
    ])
  })

  it("has no histogram for the other fields", () => {
    const withHistogram = FIELD_IDS.filter((id) => fieldMeta(id).histogram)
    expect(withHistogram).toEqual(["watch.lastPlayed", "request.age", "library.added", "file.size", "show.lastEpisodeAdded"])
  })
})

describe("fieldDisabledReason", () => {
  const all = () => true
  const without = (missing: Service) => (service: Service) => service !== missing

  it("gives the level reason first, then the first service that is not set up", () => {
    expect(fieldDisabledReason("show.status", "movie", all)).toBe("Only for whole shows and seasons")
    expect(fieldDisabledReason("season.position", "show", all)).toBe("Only for seasons")
    expect(fieldDisabledReason("show.status", "show", without("sonarr"))).toBe("Set up Sonarr to use this")
    expect(fieldDisabledReason("request.requesters", "movie", without("tautulli"))).toBe("Set up Tautulli to use this")
    expect(fieldDisabledReason("request.by", "movie", without("overseerr"))).toBe("Set up Overseerr to use this")
    expect(fieldDisabledReason("file.size", "movie", () => false)).toBeNull()
    expect(fieldDisabledReason("watch.plays", "season", all)).toBeNull()
  })
})

describe("notApplicableMessage", () => {
  it("names the field and the level (UX 6 rule 4)", () => {
    expect(notApplicableMessage("show.status", "movie")).toBe("Show status does not apply to movies. Remove it, or change the level back.")
    expect(notApplicableMessage("season.position", "show")).toBe("Season position does not apply to shows. Remove it, or change the level back.")
  })
})
