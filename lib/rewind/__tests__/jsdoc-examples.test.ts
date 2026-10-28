/**
 * @jest-environment node
 */

import { rewindFeatureOn } from '@/lib/rewind/features'
import { shareFormats } from '@/lib/rewind/page-meta'
import { seasonAudienceSwitchAt } from '@/lib/rewind/season-open'
import { seasonPrepareAt } from '@/lib/rewind/season-runs'
import { saveAllCards } from '@/lib/rewind/share-sheet'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('JSDoc Documentation Examples', () => {
  it('seasonAudienceSwitchAt: 08:00 on the opening day in the server zone', () => {
    expect(seasonAudienceSwitchAt(2026, '12-01', 'America/Chicago').toISOString()).toBe('2026-12-01T14:00:00.000Z')
  })

  it('seasonPrepareAt: 00:15 on the opening day in the westernmost zone', () => {
    expect(seasonPrepareAt(2026, '12-01', ['America/Chicago', 'America/Los_Angeles']).toISOString()).toBe('2026-12-01T08:15:00.000Z')
  })

  it('rewindFeatureOn: on only with the +key and without the plain key', () => {
    expect(rewindFeatureOn({ rewindDisabledPages: ['+race.scrubber'] }, 'race.scrubber')).toBe(true)
    expect(rewindFeatureOn({ rewindDisabledPages: ['+race.scrubber', 'race.scrubber'] }, 'race.scrubber')).toBe(false)
    expect(rewindFeatureOn(null, 'race.scrubber')).toBe(false)
  })

  it('shareFormats: a card page names its card, Setup offers none', () => {
    expect(shareFormats('top-shows')).toBe('Story card, 1080 by 1920')
    expect(shareFormats('setup')).toBeNull()
  })

  it('rewindFeatureOn: only a stored +key turns a feature on, and the plain key turns it off again', () => {
    expect(rewindFeatureOn({ rewindDisabledPages: ['+race.scrubber'] }, 'race.scrubber')).toBe(true)
    expect(rewindFeatureOn({ rewindDisabledPages: ['+race.scrubber', 'race.scrubber'] }, 'race.scrubber')).toBe(false)
    expect(rewindFeatureOn({ rewindDisabledPages: [] }, 'race.scrubber')).toBe(false)
  })

  it('saveAllCards: the calendar card needs Daily detail', () => {
    expect(saveAllCards(['cover', 'calendar', 'clock'], false)).toEqual(['cover', 'clock'])
  })
})
