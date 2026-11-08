/** Outcome reasons, exit buckets, hold codes and unknown causes (TS 11.4, TS 4.5): every label and the raw fallback. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import type { UnknownCause } from "@/lib/cleanup/engine/types"
import {
  exitBucket,
  exitsLine,
  holdCodeWords,
  OUTCOME_KINDS,
  OUTCOME_REASONS,
  outcomeDetailSchema,
  outcomeWords,
  parseOutcomeDetail,
  unknownCauseText,
} from "@/lib/cleanup/outcomes"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

const NAMES: Record<Service, string> = { plex: "Plex", tautulli: "Tautulli", overseerr: "Overseerr", radarr: "Radarr", sonarr: "Sonarr" }
const words = {
  service: (s: Service) => NAMES[s],
  protection: (id: string) => (id === "g4" ? "Played by anyone in the last 30 days." : `Protection ${id}.`),
  condition: (id: string) => (id === "c1" ? "Last played" : "Size"),
  failure: (code: string) => (code === "TIMEOUT" ? "Radarr did not answer in time." : code),
}

beforeEach(() => mockWarn.mockClear())

describe("outcome codes", () => {
  it("hold the kinds and the reasons of TS 11.4", () => {
    expect(OUTCOME_KINDS).toEqual(["deleted", "failed", "rescued", "released"])
    expect(OUTCOME_REASONS).toEqual(["played", "kept", "excluded", "markedKeepForever", "requested", "protected", "newContent",
      "conditionFailed", "notManaged", "recordChanged", "notInLibrary", "ruleOff", "libraryRemoved", "showDeleted", "deleted", "failed"])
  })
})

describe("outcomeWords", () => {
  it.each([
    ["played", {}, "A member played it."],
    ["kept", {}, "A member kept it."],
    ["excluded", {}, "You excluded it."],
    ["markedKeepForever", {}, "A member marked it Keep forever."],
    ["requested", {}, "A member requested it."],
    ["protected", { protectionId: "g4" }, "Played by anyone in the last 30 days."],
    ["protected", {}, "A protection keeps it safe."],
    ["newContent", {}, "New episodes arrived."],
    ["conditionFailed", { conditionId: "c1" }, "It no longer matches: Last played."],
    ["conditionFailed", {}, "It no longer matches."],
    ["notManaged", {}, "Radarr or Sonarr no longer matches it."],
    ["recordChanged", {}, "Its Radarr or Sonarr record changed."],
    ["notInLibrary", {}, "It left Plex."],
    ["ruleOff", {}, "Its rule left Leaving soon."],
    ["libraryRemoved", {}, "Its library left the rule."],
    ["showDeleted", {}, "Its show was deleted."],
    ["deleted", {}, "Deleted."],
    ["failed", { code: "TIMEOUT" }, "Radarr did not answer in time."],
    ["failed", {}, "The delete failed."],
  ])("%s %j reads %j", (reason, detail, text) => {
    expect(outcomeWords(reason, detail, words)).toBe(text)
  })

  it("has words for every reason", () => {
    for (const reason of OUTCOME_REASONS) expect(outcomeWords(reason, { protectionId: "g4", conditionId: "c1", code: "TIMEOUT" }, words)).not.toBe(reason)
  })

  it("adds the stillUnmonitored words (TS 11.4, safety-r3-6)", () => {
    expect(outcomeWords("played", { stillUnmonitored: "radarr" }, words)).toBe("A member played it. Still unmonitored in Radarr.")
    expect(outcomeWords("ruleOff", { stillUnmonitored: "sonarr" }, words)).toBe("Its rule left Leaving soon. Still unmonitored in Sonarr.")
  })

  it("shows an unknown stored reason raw", () => {
    expect(outcomeWords("fromANewerBuild", {}, words)).toBe("fromANewerBuild")
    expect(outcomeWords("toString", {}, words)).toBe("toString")
  })
})

describe("parseOutcomeDetail", () => {
  it("parses ids and codes, and gives {} for none or a bad value", () => {
    const detail = { conditionId: "c1", protectionId: "g4", code: "TIMEOUT", service: "radarr", stillUnmonitored: "radarr" }
    expect(outcomeDetailSchema.parse(detail)).toEqual(detail)
    expect(parseOutcomeDetail(detail)).toEqual(detail)
    expect(parseOutcomeDetail(null)).toEqual({})
    expect(mockWarn).not.toHaveBeenCalled()
    expect(parseOutcomeDetail({ stillUnmonitored: "plex" })).toEqual({})
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "outcomeDetail", dropped: 1, paths: ["stillUnmonitored"] })
  })
})

describe("exit buckets (TS 11.4)", () => {
  it.each([
    ["played", "played"],
    ["kept", "kept"],
    ["markedKeepForever", "kept"],
    ["excluded", "other"],
    ["requested", "other"],
    ["protected", "other"],
    ["newContent", "other"],
    ["conditionFailed", "other"],
    ["notManaged", "other"],
    ["recordChanged", "other"],
    ["notInLibrary", "other"],
    ["ruleOff", "other"],
    ["libraryRemoved", "other"],
    ["fromANewerBuild", "other"],
    ["showDeleted", null],
    ["deleted", null],
    ["failed", null],
  ])("puts %s in %s", (reason, bucket) => {
    expect(exitBucket(reason)).toBe(bucket)
  })

  it("writes the 7-day exits line", () => {
    expect(exitsLine({ kept: 1, played: 1, other: 1 })).toBe("In the last 7 days, 3 titles left Leaving soon: 1 kept by a member, 1 played, 1 for other reasons.")
    expect(exitsLine({ kept: 4, played: 3, other: 0 })).toBe("In the last 7 days, 7 titles left Leaving soon: 4 kept by members, 3 played.")
    expect(exitsLine({ kept: 0, played: 1, other: 0 })).toBe("In the last 7 days, 1 title left Leaving soon: 1 played.")
    expect(exitsLine({ kept: 0, played: 0, other: 2 })).toBe("In the last 7 days, 2 titles left Leaving soon: 2 for other reasons.")
    expect(exitsLine({ kept: 0, played: 0, other: 0 })).toBeNull()
  })
})

describe("unknown causes (TS 4.5)", () => {
  it.each([
    [{ kind: "sourceFailed", service: "tautulli" }, "3:07 AM", "Tautulli did not answer at 3:07 AM."],
    [{ kind: "sourceFailed", service: "sonarr" }, null, "Sonarr did not answer."],
    [{ kind: "noValue", what: "history" }, null, "Tautulli history has no start date."],
    [{ kind: "noValue", what: "access" }, null, "Plex did not answer, so access is unknown."],
    [{ kind: "noValue", what: "requester" }, null, "The requester has no Plex account in Overseerr."],
    [{ kind: "noValue", what: "size" }, null, "Size unknown."],
    [{ kind: "noValue", what: "season" }, null, "No season number."],
    [{ kind: "noValue", what: "date" }, null, "Date unknown."],
  ] as [UnknownCause, string | null, string][])("%j reads %j", (cause, readAt, text) => {
    expect(unknownCauseText(cause, { service: words.service, readAt })).toBe(text)
  })
})

describe("hold codes (TS 11.4)", () => {
  it.each([
    ["sourceFailed:tautulli", "Tautulli did not answer at 3:07 AM"],
    ["noValue:size", "Size unknown"],
    ["noValue:history", "Tautulli history has no start date"],
    ["noValue:access", "Plex did not answer, so access is unknown"],
    ["noValue:requester", "The requester has no Plex account in Overseerr"],
    ["noValue:season", "No season number"],
    ["noValue:date", "Date unknown"],
    ["noValue:g12", "Too many recent plays of the show to check"],
    ["matchUnknown", "Radarr or Sonarr did not answer"],
    ["plexMissing", "Plex does not list it now"],
  ])("%s reads %j", (code, text) => {
    expect(holdCodeWords(code, { service: words.service, readAt: "3:07 AM" })).toBe(text)
  })

  it("leaves out the time when it is not known", () => {
    expect(holdCodeWords("sourceFailed:radarr", { service: words.service })).toBe("Radarr did not answer")
  })

  it.each(["sourceFailed:jellyfin", "noValue:rating", "noValue", "somethingNew"])("shows %s raw", (code) => {
    expect(holdCodeWords(code, { service: words.service })).toBe(code)
  })
})
