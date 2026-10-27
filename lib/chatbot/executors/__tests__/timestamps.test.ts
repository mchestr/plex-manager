/**
 * Tool times reach the model as local wall time with the turn zone's offset
 * (P11.17): epochs under known keys, and ISO instants in any JSON output.
 */

import { withLocalInstants, withLocalTimestamps, PLEX_EPOCH_KEYS } from "../timestamps"

jest.mock("server-only", () => ({}))

const LA = "America/Los_Angeles"

describe("withLocalInstants", () => {
  it("puts every ISO instant, at any depth, in the zone with its offset, across the DST change", () => {
    const output = JSON.stringify({
      records: [{ airDateUtc: "2026-11-02T03:30:00Z", estimatedCompletionTime: "2026-10-27T10:00:00.000Z" }],
      createdAt: "2026-11-02T04:30:00+01:00",
    })

    expect(JSON.parse(withLocalInstants(output, LA))).toEqual({
      records: [{ airDateUtc: "2026-11-01T19:30:00-08:00", estimatedCompletionTime: "2026-10-27T03:00:00-07:00" }],
      createdAt: "2026-11-01T19:30:00-08:00",
    })
  })

  it("leaves calendar days, other strings, numbers and an invalid instant as they are", () => {
    const data = { airDate: "2026-11-02", title: "2026-11-02T03:30 premiere", runtime: 45, bad: "2026-13-45T99:99:00Z" }
    expect(JSON.parse(withLocalInstants(JSON.stringify(data), LA))).toEqual(data)
  })

  it("returns output that is not JSON, such as an error line, unchanged", () => {
    expect(withLocalInstants("Error: No active Sonarr server configured.", LA)).toBe("Error: No active Sonarr server configured.")
  })
})

describe("withLocalTimestamps", () => {
  it("converts a Plex library section's scan and change epochs", () => {
    const section = { title: "Movies", scannedAt: 1_793_590_200, contentChangedAt: "1793590200", createdAt: 0 }
    expect(withLocalTimestamps(section, PLEX_EPOCH_KEYS, LA)).toEqual({
      title: "Movies",
      scannedAt: "2026-11-01T19:30:00-08:00",
      contentChangedAt: "2026-11-01T19:30:00-08:00",
      createdAt: 0,
    })
  })
})
