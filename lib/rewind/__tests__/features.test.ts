import { enabledFeatures, REWIND_FEATURE_KEYS, rewindFeatureFlags, rewindFeatureOn, withEnabledFeatures } from "@/lib/rewind/features"
import { rewindSettingsSchema } from "@/lib/validations/rewind-settings"
import { buildConfig } from "@/__tests__/helpers/factories"

const settings = {
  rewindEnabled: true,
  rewindAudience: "admins",
  rewindSeasonOpens: "12-01",
  rewindSeasonCloses: "01-31",
  rewindLlmMode: "standard",
  rewindLlmBudgetUsd: 10,
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: [],
  rewindExcludedContentRatings: [],
  rewindIncludeManagedUsers: false,
  rewindNotifyChannels: [],
}

describe("rewindFeatureOn (P8.3, P8.4)", () => {
  it("has every feature off on a fresh Config", () => {
    const config = buildConfig()
    for (const key of REWIND_FEATURE_KEYS) expect(rewindFeatureOn(config, key)).toBe(false)
    expect(Object.values(rewindFeatureFlags(config)).every((on) => !on)).toBe(true)
    expect(rewindFeatureOn(null, "notes.core")).toBe(false)
  })

  it("turns on only the feature whose +key is stored", () => {
    const config = { rewindDisabledPages: ["+race.scrubber", "people"] }
    expect(rewindFeatureOn(config, "race.scrubber")).toBe(true)
    expect(REWIND_FEATURE_KEYS.filter((key) => rewindFeatureOn(config, key))).toEqual(["race.scrubber"])
  })

  it("is off again when the plain key sits beside the +key", () => {
    expect(rewindFeatureOn({ rewindDisabledPages: ["+race.scrubber", "race.scrubber"] }, "race.scrubber")).toBe(false)
  })

  it("reads the P8.4 flags as booleans", () => {
    expect(rewindFeatureFlags({ rewindDisabledPages: ["+notes.core", "+share.save-all"] })).toEqual({
      compare2025: false,
      editCard: false,
      saveAll: true,
      coreNotes: true,
    })
  })

  it("writes and removes only the enable entries", () => {
    const list = ["people", "+notes.core", "share.edit-card"]
    expect(withEnabledFeatures(list, ["share.save-all"])).toEqual(["people", "share.edit-card", "+share.save-all"])
    expect(enabledFeatures(["+notes.core", "notes.core", "people"])).toEqual(["notes.core"])
  })
})

describe("rewindSettingsSchema and the feature entries", () => {
  const parse = (rewindDisabledPages: string[]) => rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages })

  it("accepts +key and the plain key of a known feature, in a stable order", () => {
    const parsed = parse(["+notes.core", "people", "+race.scrubber"])
    expect(parsed.success && parsed.data.rewindDisabledPages).toEqual(["people", "+race.scrubber", "+notes.core"])
    expect(parse(["race.scrubber"]).success).toBe(true)
  })

  it("refuses an unknown +key", () => {
    expect(parse(["+race.rewinder"]).success).toBe(false)
    expect(parse(["+people"]).success).toBe(false)
  })
})
