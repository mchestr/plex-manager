/**
 * decideMissingForMember: an answer instead of a report (not aired yet, or
 * seasons that aren't monitored, with Overseerr's page to request them), a
 * fix to start, or the server admin with why.
 */

import { getActiveService } from "@/lib/data/active-service"
import { decideMissingForMember } from "@/lib/problem-reports/report-missing"
import { readMissingState } from "@/lib/problem-reports/steps/missing-state"

jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/problem-reports/steps/missing-state", () => ({ readMissingState: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const SHOW = { ratingKey: "6999", type: "show", title: "The Office", ids: { tvdb: 73244, tmdb: 2316 }, parts: [], locations: [] }
const ok = (decision: object) => ({ ok: true, sonarr: { name: "Sonarr", url: "u", apiKey: "k" }, show: SHOW, seriesId: 42, decision }) as never

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockResolvedValue({ publicUrl: "https://requests.example.com" } as never)
})

describe("decideMissingForMember", () => {
  it("starts a fix for episodes to search for or scan", async () => {
    jest.mocked(readMissingState).mockResolvedValueOnce(ok({ kind: "SEARCH", episodeIds: [1] })).mockResolvedValueOnce(ok({ kind: "SCAN", episodeIds: [1] }))

    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ startsFix: true })
    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ startsFix: true })
  })

  it("answers when the next episode comes out", async () => {
    jest.mocked(readMissingState).mockResolvedValue(ok({ kind: "NOT_AIRED", season: 2, episode: 6, airsAt: "2026-11-14T02:00:00Z" }))

    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ answer: { kind: "NOT_AIRED", season: 2, episode: 6, airsAt: "2026-11-14T02:00:00Z" } })
  })

  it("answers which seasons aren't on the server, with Overseerr's page when it has a public URL", async () => {
    jest.mocked(readMissingState).mockResolvedValue(ok({ kind: "NOT_ON_SERVER", seasons: [3] }))
    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ answer: { kind: "NOT_ON_SERVER", seasons: [3], requestHref: "https://requests.example.com/tv/2316" } })

    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ answer: { kind: "NOT_ON_SERVER", seasons: [3], requestHref: null } })
  })

  it("sends the rest to the server admin with why", async () => {
    jest.mocked(readMissingState).mockResolvedValueOnce(ok({ kind: "NOTHING_MISSING" })).mockResolvedValueOnce({ ok: false, reason: "NO_SONARR" })

    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ startsFix: false, reason: "NOTHING_MISSING" })
    await expect(decideMissingForMember(SERVER, SHOW, NOW)).resolves.toEqual({ startsFix: false, reason: "NO_SONARR" })
  })
})
