/**
 * The upgrade rule behind Look for a better copy: the profile must allow
 * upgrades, and the file must be below its quality cutoff or its custom
 * format cutoff; and the profile read that applies it to a resolved file.
 */

import { getArrQualityProfile } from "@/lib/connections/arr-upgrade"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"
import { readUpgrade, wantsUpgrade } from "@/lib/problem-reports/upgrade"

jest.mock("@/lib/connections/arr-upgrade", () => ({ getArrQualityProfile: jest.fn() }))

const PROFILE = { id: 4, upgradeAllowed: true, cutoffFormatScore: 100 }
const FILE = { qualityCutoffNotMet: false, customFormatScore: 100 }

describe("wantsUpgrade", () => {
  it("wants an upgrade for a file below the quality cutoff", () => {
    expect(wantsUpgrade(PROFILE, { ...FILE, qualityCutoffNotMet: true })).toBe(true)
  })

  it("wants an upgrade for a file below the custom format cutoff, which the quality cutoff alone misses", () => {
    expect(wantsUpgrade(PROFILE, { ...FILE, customFormatScore: 99 })).toBe(true)
  })

  it("wants none for a file at both cutoffs", () => {
    expect(wantsUpgrade(PROFILE, FILE)).toBe(false)
  })

  it("wants none when the profile doesn't allow upgrades, however low the file", () => {
    expect(wantsUpgrade({ ...PROFILE, upgradeAllowed: false }, { qualityCutoffNotMet: true, customFormatScore: 0 })).toBe(false)
  })

  it("wants none when the service doesn't say how the file compares", () => {
    expect(wantsUpgrade({ ...PROFILE, cutoffFormatScore: null }, { qualityCutoffNotMet: null, customFormatScore: null })).toBe(false)
    expect(wantsUpgrade(PROFILE, { qualityCutoffNotMet: null, customFormatScore: null })).toBe(false)
  })
})

describe("readUpgrade", () => {
  const RESOLVED = {
    service: "sonarr",
    config: { name: "Sonarr", url: "http://sonarr.local:8989", apiKey: "arr-key" },
    titleId: 42,
    qualityProfileId: 6,
    file: { id: 501, relativePath: null, path: "/tv/x.mkv", size: 1, qualityCutoffNotMet: true, customFormatScore: 0 },
    episodeIds: [11],
    plex: { ratingKey: "7001", sectionId: "2", file: "/data/tv/x.mkv", folder: "/data/tv" },
  } satisfies ResolvedFile

  it("reads the file's profile and applies the rule", async () => {
    jest.mocked(getArrQualityProfile).mockResolvedValue({ success: true, data: PROFILE })

    await expect(readUpgrade(RESOLVED)).resolves.toBe(true)
    expect(getArrQualityProfile).toHaveBeenCalledWith("Sonarr", RESOLVED.config, 6)
  })

  it("is null when the profile can't be read", async () => {
    jest.mocked(getArrQualityProfile).mockResolvedValue({ success: false, error: "down" })

    await expect(readUpgrade({ ...RESOLVED, service: "radarr" })).resolves.toBeNull()
    expect(getArrQualityProfile).toHaveBeenLastCalledWith("Radarr", RESOLVED.config, 6)
  })
})
