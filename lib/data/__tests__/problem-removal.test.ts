/**
 * What the confirm for Remove the file and search reads: the release that
 * will be blocklisted, the recycle bin and Plex's trash, or nothing when the
 * file can't be read; admins only.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getArrMediaManagement } from "@/lib/connections/arr-swap"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { plexEmptiesTrash } from "@/lib/connections/plex-file-state"
import { assertAdmin } from "@/lib/admin"
import { getRemovalFacts } from "@/lib/data/problem-removal"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { resolveFile, type ResolvedFile } from "@/lib/problem-reports/resolve"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/connections/arr-swap", () => ({ getArrMediaManagement: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/plex-file-state", () => ({ plexEmptiesTrash: jest.fn() }))
jest.mock("@/lib/problem-reports/bad-copy", () => ({ findBadCopy: jest.fn() }))
jest.mock("@/lib/problem-reports/resolve", () => ({ resolveFile: jest.fn() }))

const SERVER = { name: "Home", url: "http://plex.local:32400", token: "owner-token", adminPlexUserId: "owner", machineIdentifier: "m" }
const SONARR = { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "sonarr-key" }
const EPISODE: ResolvedFile = {
  service: "sonarr",
  config: SONARR,
  titleId: 42,
  qualityProfileId: 6,
  file: { id: 501, relativePath: null, path: "/tv/x.mkv", size: 1, qualityCutoffNotMet: false, customFormatScore: 0, sceneName: null, quality: null, languages: [] },
  episodeIds: [11],
  plex: { ratingKey: "7001", guid: "plex://episode/pilot", sectionId: "2", file: "/data/tv/x.mkv", folder: "/data/tv" },
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.resetAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1" } } as never)
  prismaMock.problemReport.findUnique.mockResolvedValue({ plexRatingKey: "7001" } as never)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(resolveFile).mockResolvedValue({ ok: true, resolved: EPISODE })
  jest.mocked(findBadCopy).mockResolvedValue({ titles: ["Show.S01E01.BAD"], infoHash: null, grab: { id: 10, downloadId: "D", title: "Show.S01E01.BAD" } })
  jest.mocked(getArrMediaManagement).mockResolvedValue({ success: true, data: { recycleBin: false } })
  jest.mocked(plexEmptiesTrash).mockResolvedValue(true)
})

describe("getRemovalFacts", () => {
  it("says which release Sonarr will blocklist, whether it keeps the file, and whether Plex empties its trash", async () => {
    await expect(getRemovalFacts("report-1")).resolves.toEqual({ service: "Sonarr", blocklists: "Show.S01E01.BAD", recycleBin: false, emptiesTrash: true })
    expect(resolveFile).toHaveBeenCalledWith(SERVER, "7001")
    expect(getArrMediaManagement).toHaveBeenCalledWith("Sonarr", SONARR)
    expect(plexEmptiesTrash).toHaveBeenCalledWith(SERVER)
  })

  it("names no release for a file added by hand, and doesn't know a recycle bin it can't read", async () => {
    jest.mocked(findBadCopy).mockResolvedValue({ titles: [], infoHash: null, grab: null })
    jest.mocked(getArrMediaManagement).mockResolvedValue({ success: false, error: "down" })

    await expect(getRemovalFacts("report-1")).resolves.toMatchObject({ blocklists: null, recycleBin: null })
  })

  it.each([
    ["the report isn't there", () => prismaMock.problemReport.findUnique.mockResolvedValue(null)],
    ["no Plex server is active", () => jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)],
    ["the file can't be resolved", () => jest.mocked(resolveFile).mockResolvedValue({ ok: false, reason: "UNAVAILABLE" })],
    ["the history can't be read", () => jest.mocked(findBadCopy).mockResolvedValue(null)],
  ])("is null when %s", async (_label, arrange) => {
    arrange()

    await expect(getRemovalFacts("report-1")).resolves.toBeNull()
  })

  it("checks for an admin first", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(getRemovalFacts("report-1")).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.problemReport.findUnique).not.toHaveBeenCalled()
  })
})
