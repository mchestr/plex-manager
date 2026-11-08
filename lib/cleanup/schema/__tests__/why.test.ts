/** The stored Why (TS 3.4): the builder output parses, a bad value gives null with no throw, and the log holds paths only. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import { buildWhySnapshot } from "@/lib/cleanup/__tests__/helpers/builders"
import { parseWhy, REQUESTER_KINDS, whySnapshotSchema } from "@/lib/cleanup/schema/why"

beforeEach(() => mockWarn.mockClear())

describe("whySnapshotSchema", () => {
  it("parses the builder output", () => {
    const why = buildWhySnapshot()
    expect(whySnapshotSchema.parse(why)).toEqual(why)
    expect(parseWhy(why)).toEqual(why)
  })

  it("names each requester by kind only, never by id", () => {
    expect(REQUESTER_KINDS).toEqual(["member", "former", "owner", "unknown"])
    const why = buildWhySnapshot()
    const withId = { ...why, facts: { ...why.facts, requests: [{ at: 1, requester: "100" }] } }
    expect(whySnapshotSchema.safeParse(withId).success).toBe(false)
    expect(whySnapshotSchema.parse({ ...why, facts: { ...why.facts, requests: [{ at: 1, requester: "owner", by: "100" }] } }).facts.requests).toEqual([
      { at: 1, requester: "owner" },
    ])
  })

  it("takes a condition verdict with a cause, and the three protection states", () => {
    const why = buildWhySnapshot({
      conditions: [{ id: "c1", field: "watch.lastPlayed", verdict: "unknown", cause: "sourceFailed:tautulli" }],
      protections: [{ id: "g1", verdict: "protects" }, { id: "g4", verdict: "unknown" }, { id: "p1", verdict: "clear" }],
    })
    expect(parseWhy(why)).toEqual(why)
  })
})

describe("parseWhy", () => {
  it.each([[null], [undefined]])("gives null for %j with no log", (raw) => {
    expect(parseWhy(raw)).toBeNull()
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("gives null for a bad value, and logs its paths only", () => {
    const why = buildWhySnapshot()
    expect(parseWhy({ ...why, v: 2, match: { ...why.match, path: 42 } })).toBeNull()
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "why", dropped: 1, paths: ["v", "match.path"] })
    expect(parseWhy("why")).toBeNull()
  })
})
