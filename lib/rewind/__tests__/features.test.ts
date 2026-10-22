/**
 * @jest-environment node
 */

import { buildConfig } from '@/__tests__/helpers/factories'
import { enableEntry, REWIND_FEATURES, rewindFeatureFlags, rewindFeatureOn } from '@/lib/rewind/features'
import { rewindSettingsSchema, type RewindSettingsInput } from '@/lib/validations/rewind-settings'
import { rewindSettingsFromConfig } from '@/lib/wrapped/config'

const settings: RewindSettingsInput = {
  rewindEnabled: true,
  rewindAudience: 'all',
  rewindSeasonOpens: '12-01',
  rewindSeasonCloses: '01-31',
  rewindLlmMode: 'standard',
  rewindLlmBudgetUsd: 10,
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: [],
  rewindExcludedContentRatings: [],
  rewindIncludeManagedUsers: false,
  rewindDisabledPages: [],
  rewindNotifyChannels: ['banner'],
}

describe('Rewind feature flags (P8.3)', () => {
  it('has every feature off on a fresh Config', () => {
    const config = buildConfig()
    for (const { key } of REWIND_FEATURES) expect(rewindFeatureOn(config, key)).toBe(false)
    expect(Object.values(rewindFeatureFlags(config)).some(Boolean)).toBe(false)
    expect(rewindFeatureOn(null, 'race.scrubber')).toBe(false)
  })

  it('turns one feature on with its +key, and only that one', () => {
    const flags = rewindFeatureFlags(buildConfig({ rewindDisabledPages: ['people', '+race.scrubber'] }))
    expect(flags['race.scrubber']).toBe(true)
    expect(flags['calendar.grid']).toBe(false)
    expect(flags['calendar.day-picker']).toBe(false)
    expect(flags['stage.tap-completes']).toBe(false)
  })

  it('turns it off again when the plain key sits beside the +key', () => {
    expect(rewindFeatureOn({ rewindDisabledPages: ['+race.scrubber', 'race.scrubber'] }, 'race.scrubber')).toBe(false)
  })

  it('ignores a stored value that is not a list', () => {
    expect(rewindFeatureOn({ rewindDisabledPages: '+race.scrubber' }, 'race.scrubber')).toBe(false)
  })

  it("accepts the known entries in P7.12's schema, in a stable order, and rejects an unknown +key", () => {
    const parsed = rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages: ['+stage.tap-completes', 'race', '+race.scrubber'] })
    expect(parsed.success && parsed.data.rewindDisabledPages).toEqual(['race', '+race.scrubber', '+stage.tap-completes'])
    expect(rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages: ['+race.confetti'] }).success).toBe(false)
    expect(rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages: ['+race'] }).success).toBe(false)
  })

  it('keeps the feature entries when the section reads the stored row', () => {
    const row = buildConfig({ rewindDisabledPages: ['+calendar.grid', 'taste', '+unknown'] })
    expect(rewindSettingsFromConfig(row).rewindDisabledPages).toEqual(['taste', enableEntry('calendar.grid')])
  })
})

describe('Rewind feature flags (P8.4)', () => {
  it('lists the P8.4 keys, each off on a fresh Config', () => {
    const flags = rewindFeatureFlags(buildConfig())
    for (const key of ['number.compare-2025', 'share.edit-card', 'share.save-all', 'notes.core'] as const) expect(flags[key]).toBe(false)
  })

  it('turns a P8.4 feature on with its +key, and off again beside its plain key', () => {
    const flags = rewindFeatureFlags({ rewindDisabledPages: ['+notes.core', '+share.save-all', 'share.save-all'] })
    expect(flags['notes.core']).toBe(true)
    expect(flags['share.save-all']).toBe(false)
    expect(flags['race.scrubber']).toBe(false)
  })

  it('accepts the P8.4 entries in the schema and rejects an unknown one', () => {
    const parsed = rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages: ['+notes.core', 'people', '+race.scrubber'] })
    expect(parsed.success && parsed.data.rewindDisabledPages).toEqual(['people', '+race.scrubber', '+notes.core'])
    expect(rewindSettingsSchema.safeParse({ ...settings, rewindDisabledPages: ['+share.everything'] }).success).toBe(false)
  })
})
