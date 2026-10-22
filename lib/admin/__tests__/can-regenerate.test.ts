import { canRegenerate, rewindRowState } from '@/lib/admin/can-regenerate'

const NOW = Date.parse('2026-12-03T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000)

describe('canRegenerate', () => {
  it('refuses a run that has been generating for 14 minutes', () => {
    expect(canRegenerate({ status: 'generating', runStartedAt: minutesAgo(14) }, NOW)).toBe(false)
  })

  it('allows a run that has been generating for 16 minutes', () => {
    expect(canRegenerate({ status: 'generating', runStartedAt: minutesAgo(16) }, NOW)).toBe(true)
    expect(canRegenerate({ status: 'generating', runStartedAt: minutesAgo(16).toISOString() }, NOW)).toBe(true)
  })

  it('refuses a generating row whose start is unknown', () => {
    expect(canRegenerate({ status: 'generating', runStartedAt: null }, NOW)).toBe(false)
  })

  it.each(['failed', 'completed'])('allows a %s row', (status) => {
    expect(canRegenerate({ status, runStartedAt: null }, NOW)).toBe(true)
  })

  it('allows a missing row', () => {
    expect(canRegenerate({ status: null, runStartedAt: null }, NOW)).toBe(true)
  })
})

describe('rewindRowState', () => {
  it('reads an active run as generating, then stuck past 15 minutes', () => {
    expect(rewindRowState('completed', minutesAgo(14), NOW)).toBe('generating')
    expect(rewindRowState('completed', minutesAgo(16).toISOString(), NOW)).toBe('stuck')
  })

  it.each([
    ['completed', 'ready'],
    ['failed', 'failed'],
    ['generating', 'generating'],
    [null, 'notStarted'],
  ] as const)('reads %s with no active run as %s', (status, state) => {
    expect(rewindRowState(status, null, NOW)).toBe(state)
  })
})
