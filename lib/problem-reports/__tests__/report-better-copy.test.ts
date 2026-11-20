/**
 * decideBetterCopyForMember: the server admin when the member's Plex app
 * converted their last play or the file can't be resolved, Look for a better
 * copy when the profile wants one, and an answer when it wants none.
 */

import type { Evidence } from "@/lib/problem-reports/evidence"
import { decideBetterCopyForMember } from "@/lib/problem-reports/report-better-copy"
import { resolveFile, type ResolvedFile } from "@/lib/problem-reports/resolve"
import { readUpgrade } from "@/lib/problem-reports/upgrade"

jest.mock("@/lib/problem-reports/resolve", () => ({ resolveFile: jest.fn() }))
jest.mock("@/lib/problem-reports/upgrade", () => ({ readUpgrade: jest.fn() }))

const SERVER = { url: "http://plex.local:32400", token: "owner-token" }
const RESOLVED = { service: "radarr", titleId: 5 } as ResolvedFile
const played = (transcoded: boolean): Evidence => ({ lastPlay: { player: "Living Room TV", transcoded, at: "2026-11-08T20:00:00.000Z" }, playedToEnd: true })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: RESOLVED })
})

describe("decideBetterCopyForMember", () => {
  it("starts a fix when the profile wants a better copy", async () => {
    jest.mocked(readUpgrade).mockResolvedValue(true)

    await expect(decideBetterCopyForMember(SERVER, "555", played(false))).resolves.toEqual({ startsFix: true })
    expect(resolveFile).toHaveBeenCalledWith(SERVER, "555")
    expect(readUpgrade).toHaveBeenCalledWith(RESOLVED)
  })

  it("answers that this is the best copy the server keeps when the profile wants none", async () => {
    jest.mocked(readUpgrade).mockResolvedValue(false)

    await expect(decideBetterCopyForMember(SERVER, "555", { lastPlay: null, playedToEnd: null })).resolves.toEqual({ answer: { kind: "BEST_COPY" } })
  })

  it("sends it to the server admin without reading Radarr when the member's Plex app converted their last play", async () => {
    await expect(decideBetterCopyForMember(SERVER, "555", played(true))).resolves.toEqual({ startsFix: false, reason: "TRANSCODED" })
    expect(resolveFile).not.toHaveBeenCalled()
  })

  it.each([
    ["the file can't be resolved", () => jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "MULTI_PART" }), "MULTI_PART"],
    ["the profile can't be read", () => jest.mocked(readUpgrade).mockResolvedValue(null), "UNAVAILABLE"],
  ])("sends it to the server admin when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(decideBetterCopyForMember(SERVER, "555", played(false))).resolves.toEqual({ startsFix: false, reason })
  })
})
