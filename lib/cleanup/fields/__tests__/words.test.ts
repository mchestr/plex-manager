/** The shared words (TS 4.2, UX 5.8): durations, sizes, lists, requesters, dates, verbs, nouns and validation messages. */

import { fieldMeta } from "@/lib/cleanup/fields/catalog"
import { durationMessage, isDuration } from "@/lib/cleanup/fields/values"
import {
  dateWords,
  durationWords,
  joinAnd,
  joinOr,
  LEVEL_NAMES,
  nounWord,
  requesterRefWords,
  requesterWords,
  SERVICE_NAMES,
  sizeWords,
  UNKNOWN_MEMBER,
  verbs,
} from "@/lib/cleanup/fields/words"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

describe("durationWords", () => {
  it("keeps the unit the admin chose, singular at 1", () => {
    expect(durationWords({ amount: 365, unit: "days" })).toBe("365 days")
    expect(durationWords({ amount: 1, unit: "days" })).toBe("1 day")
    expect(durationWords({ amount: 1, unit: "weeks" })).toBe("1 week")
    expect(durationWords({ amount: 3, unit: "weeks" })).toBe("3 weeks")
    expect(durationWords({ amount: 6, unit: "months" })).toBe("6 months")
    expect(durationWords({ amount: 1, unit: "months" })).toBe("1 month")
    expect(durationWords({ amount: 1, unit: "years" })).toBe("1 year")
    expect(durationWords({ amount: 2, unit: "years" })).toBe("2 years")
  })
})

describe("sizeWords", () => {
  it("rounds as formatBytes does, in the chosen unit", () => {
    expect(sizeWords(20 * GiB, "GB")).toBe("20 GB")
    expect(sizeWords(1.5 * TiB, "TB")).toBe("1.5 TB")
    expect(sizeWords(1.5 * TiB, "GB")).toBe("1536 GB")
    expect(sizeWords(GiB * 1.234567, "GB")).toBe("1.23 GB")
  })
})

describe("list joins", () => {
  it("joins with commas, and the last word before the last one", () => {
    expect(joinOr([])).toBe("")
    expect(joinOr(["a"])).toBe("a")
    expect(joinOr(["a", "b"])).toBe("a or b")
    expect(joinOr(["a", "b", "c"])).toBe("a, b or c")
    expect(joinAnd(["Movies", "Kids Movies"])).toBe("Movies and Kids Movies")
    expect(joinAnd(["A", "B", "C"])).toBe("A, B and C")
  })
})

describe("requester words", () => {
  const words = { memberName: (id: string) => (id === "u1" ? "Riley Okafor" : null) }

  it("gives the list words of UX 5.8, and Unknown member for a member with no name", () => {
    expect(requesterRefWords({ kind: "anyMember" })).toBe("any member")
    expect(requesterRefWords({ kind: "former" })).toBe("former members")
    expect(requesterRefWords({ kind: "inactive", days: 90 })).toBe("members inactive for 90 days")
    expect(requesterRefWords({ kind: "inactive", days: 1 })).toBe("members inactive for 1 day")
    expect(requesterRefWords({ kind: "member", userId: "u1" }, words)).toBe("Riley Okafor")
    expect(requesterRefWords({ kind: "member", userId: "u2" }, words)).toBe(UNKNOWN_MEMBER)
    expect(requesterRefWords({ kind: "member", userId: "u1" })).toBe("Unknown member")
    expect(requesterWords([{ kind: "former" }, { kind: "member", userId: "u1" }, { kind: "inactive", days: 30 }], words)).toBe(
      "former members, Riley Okafor or members inactive for 30 days",
    )
  })
})

describe("dateWords", () => {
  it("formats a day key as it is, and an instant in a zone", () => {
    expect(dateWords("2022-06-14")).toBe("Jun 14, 2022")
    expect(dateWords("2022-06-14T03:00:00.000Z")).toBe("Jun 14, 2022")
    expect(dateWords("2022-06-14T03:00:00.000Z", "America/Vancouver")).toBe("Jun 13, 2022")
  })
})

describe("names and nouns", () => {
  it("gives the level names, nouns, service names and verbs", () => {
    expect(LEVEL_NAMES).toEqual({ movie: "Movies", show: "Whole shows", season: "Seasons" })
    expect([nounWord(1, "movie"), nounWord(2, "show"), nounWord(0, "season"), nounWord(1, "title"), nounWord(3, "item")]).toEqual([
      "movie", "shows", "seasons", "title", "items",
    ])
    expect(Object.values(SERVICE_NAMES)).toEqual(["Plex", "Tautulli", "Overseerr", "Radarr", "Sonarr"])
    expect(verbs("plural")).toEqual({ were: "were", have: "have", are: "are", their: "their" })
    expect(verbs("singular")).toEqual({ were: "was", have: "has", are: "is", their: "its" })
  })
})

describe("validation messages (UX 6, X4)", () => {
  it("names the chosen unit and its range", () => {
    expect(durationMessage({ amount: 0, unit: "days" })).toBe("Enter a whole number of days from 1 to 3650.")
    expect(durationMessage({ amount: 522, unit: "weeks" })).toBe("Enter a whole number of weeks from 1 to 521.")
    expect(durationMessage({ amount: 1.5, unit: "months" })).toBe("Enter a whole number of months from 1 to 121.")
    expect(durationMessage({ amount: 11, unit: "years" })).toBe("Enter a whole number of years from 1 to 10.")
    expect(durationMessage({ amount: 10, unit: "years" })).toBeNull()
    expect(durationMessage({ amount: 5, unit: "fortnights" })).toBe("Enter a whole number of days from 1 to 3650.")
    expect(durationMessage(undefined)).toBe("Enter a whole number of days from 1 to 3650.")
    expect(isDuration({ amount: 3650, unit: "days" })).toBe(true)
    expect(isDuration({ amount: 3651, unit: "days" })).toBe(false)
  })

  it("gives each field its message by value", () => {
    const days = (amount: number, unit = "days") => ({ duration: { amount, unit } })
    expect(fieldMeta("watch.lastPlayed").validationMessage("moreThan", { ...days(0), orNever: true })).toBe("Enter a whole number of days from 1 to 3650.")
    expect(fieldMeta("watch.lastPlayed").validationMessage("moreThan", { ...days(12, "years"), orNever: true })).toBe(
      "Enter a whole number of years from 1 to 10.",
    )
    expect(fieldMeta("watch.lastPlayed").validationMessage("moreThan", "365")).toBe("Enter a whole number of days from 1 to 3650.")
    expect(fieldMeta("request.age").validationMessage("moreThan", days(122, "months"))).toBe("Enter a whole number of months from 1 to 121.")
    expect(fieldMeta("library.added").validationMessage("lessThan", days(90))).toBeNull()
    expect(fieldMeta("show.lastEpisodeAdded").validationMessage("lessThan", days(0))).toBe("Enter a whole number of days from 1 to 3650.")

    const plays = fieldMeta("watch.plays")
    expect(plays.validationMessage("atLeast", { count: 1001, window: { kind: "total" } })).toBe("Enter a whole number of plays from 0 to 1000.")
    expect(plays.validationMessage("atLeast", { count: 0, window: { kind: "total" } })).toBeNull()
    expect(plays.validationMessage("fewerThan", { count: 0, window: { kind: "total" } })).toBe("Enter a whole number of plays from 1 to 1000.")
    expect(plays.validationMessage("fewerThan", { count: 2, window: { kind: "last", duration: { amount: 0, unit: "weeks" } } })).toBe(
      "Enter a whole number of weeks from 1 to 521.",
    )
    expect(plays.validationMessage("fewerThan", { count: 2, window: { kind: "last", duration: { amount: 2, unit: "weeks" } } })).toBeNull()
    expect(plays.validationMessage("fewerThan", { count: 2 })).toBeNull()
    expect(plays.validationMessage("fewerThan", null)).toBe("Enter a whole number of plays from 1 to 1000.")

    const by = fieldMeta("request.by")
    expect(by.validationMessage("only", { requesters: [] })).toBe("Pick at least one member or group.")
    expect(by.validationMessage("only", {})).toBe("Pick at least one member or group.")
    expect(by.validationMessage("only", null)).toBe("Pick at least one member or group.")
    expect(by.validationMessage("only", { requesters: Array.from({ length: 51 }, () => ({ kind: "former" })) })).toBe("Pick at most 50 members or groups.")
    expect(by.validationMessage("only", { requesters: [{ kind: "inactive", days: 0 }] })).toBe("Enter a whole number of days from 1 to 3650.")
    expect(by.validationMessage("only", { requesters: [{ kind: "nobody" }] })).toBe("Pick at least one member or group.")
    expect(by.validationMessage("only", { requesters: [{ kind: "former" }, { kind: "member", userId: "u1" }] })).toBeNull()

    const size = fieldMeta("file.size")
    expect(size.validationMessage("moreThan", { bytes: GiB / 2, unit: "GB" })).toBe("Enter a size from 1 GB to 50 TB.")
    expect(size.validationMessage("moreThan", { bytes: 51 * TiB, unit: "TB" })).toBe("Enter a size from 1 GB to 50 TB.")
    expect(size.validationMessage("moreThan", { bytes: 2 * GiB, unit: "MB" })).toBe("Enter a size from 1 GB to 50 TB.")
    expect(size.validationMessage("moreThan", null)).toBe("Enter a size from 1 GB to 50 TB.")
    expect(size.validationMessage("lessThan", { bytes: TiB, unit: "TB" })).toBeNull()
    expect(size.validationMessage("lessThan", { bytes: GiB, unit: "GB" })).toBeNull()

    expect(fieldMeta("show.seasonsOnDisk").validationMessage("atLeast", { count: 0 })).toBe("Enter a whole number of seasons from 1 to 100.")
    expect(fieldMeta("show.seasonsOnDisk").validationMessage("atLeast", { count: 100 })).toBeNull()
    expect(fieldMeta("season.position").validationMessage("newest", { count: 21 })).toBe("Enter a whole number from 1 to 20.")
    expect(fieldMeta("season.position").validationMessage("newest", {})).toBe("Enter a whole number from 1 to 20.")
    expect(fieldMeta("season.position").validationMessage("newest", { count: 1 })).toBeNull()
    for (const id of ["request.exists", "request.requesters", "show.status"] as const) expect(fieldMeta(id).validationMessage("is", {})).toBeNull()
  })
})
