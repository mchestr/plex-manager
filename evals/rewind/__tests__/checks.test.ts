import { posterLineIds } from '@/lib/wrapped/archetypes/catalogue'
import type { RewindCopyV3Wire } from '@/lib/wrapped/copy/schema'
import type { RewindFactsV3 } from '@/lib/wrapped/facts/catalogue'

import {
  archetypeSpread,
  checkRun,
  deckOverlap,
  groundingRates,
  jaccard,
  MAX_DECK_OVERLAP,
  outcomeOf,
  trigrams,
  type FixtureOutcome,
  type RunTrail,
} from '../checks'

const FACTS: RewindFactsV3 = {}

const trail = (overrides: Partial<RunTrail['trail']> = {}): RunTrail['trail'] => ({
  path: 'llm',
  raw: copyWith({}),
  issues: {},
  repaired: [],
  fallbacks: [],
  ...overrides,
})

function copyWith(decks: Partial<RewindCopyV3Wire['decks']>): RewindCopyV3Wire {
  const empty = { number: null, bookends: null, topShows: null, topFilms: null, taste: null, people: null, clock: null, calendar: null, records: null, requests: null, standing: null, nextYear: null }
  return {
    decks: { ...empty, ...decks },
    archetype: { id: 'loyalist', tagline: 'Loyal to the end.', dedication: 'You kept coming back.', posterLineId: posterLineIds('loyalist')[0] as RewindCopyV3Wire['archetype']['posterLineId'] },
    signOff: null,
  }
}

const run = (overrides: Partial<RunTrail> = {}): RunTrail => ({
  edition: 'full',
  pages: ['number', 'clock'],
  archetype: { id: 'loyalist' },
  facts: FACTS,
  copy: null,
  trail: trail(),
  ...overrides,
})

const outcome = (fixture: string, overrides: Partial<FixtureOutcome> = {}): FixtureOutcome => ({
  fixture,
  edition: 'full',
  archetype: 'loyalist',
  called: true,
  slots: [],
  firstPassFailed: [],
  afterRepairFailed: [],
  reason: null,
  texts: [],
  ...overrides,
})

const deck = (text: string, origin: 'llm' | 'repair' | 'template' = 'llm') => ({ slot: 'deck.number', origin, text, rendered: text })

describe('n-gram overlap', () => {
  it('scores known pairs', () => {
    expect(jaccard(trigrams('a b c d'), trigrams('a b c e'))).toBeCloseTo(1 / 3)
    expect(jaccard(trigrams('you kept coming back'), trigrams('You kept coming back.'))).toBe(1)
    expect(jaccard(trigrams('one two three'), trigrams('four five six'))).toBe(0)
    expect(jaccard(new Set(), new Set())).toBe(0)
  })

  it('reads a token as its fact id, so one sentence with other titles is the same sentence', () => {
    const a = trigrams('{{fact:series[1].title}} led the way, with {{fact:series[2].title}} close behind.')
    expect(a.has('series_1__title led the')).toBe(true)
    expect(jaccard(a, trigrams('{{fact:series[1].title}} led the way, with {{fact:series[2].title}} close behind.'))).toBe(1)
    expect(jaccard(a, trigrams('{{fact:films[1].title}} led the way, with {{fact:films[2].title}} close behind.'))).toBeLessThan(1)
  })

  it('flags a pair at or over the limit and ignores template decks', () => {
    const same = 'You came back to it every weekend without fail.'
    const { max, issues } = deckOverlap([
      outcome('a', { texts: [deck(same)] }),
      outcome('b', { texts: [deck(same)] }),
      outcome('c', { texts: [deck('Something else entirely happened over here this year.')] }),
      outcome('d', { texts: [deck(same, 'template')] }),
    ])
    expect(max).toEqual({ pair: ['a', 'b'], value: 1 })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ check: 'overlap', fixture: null })
    expect(MAX_DECK_OVERLAP).toBe(0.35)
  })
})

describe('archetype spread', () => {
  it('fails an archetype that wins more than half of the non-postcard fixtures', () => {
    const { counts, issues } = archetypeSpread([
      outcome('a'),
      outcome('b'),
      outcome('c'),
      outcome('d', { archetype: 'explorer' }),
      outcome('e', { edition: 'postcard', archetype: null }),
    ])
    expect(counts).toEqual({ loyalist: 3, explorer: 1 })
    expect(issues).toEqual([{ fixture: null, check: 'archetype-spread', message: 'loyalist wins 3 of 4 non-postcard fixtures' }])
  })

  it('allows exactly half, and leaves postcards out of the count', () => {
    const { issues } = archetypeSpread([
      outcome('a'),
      outcome('b'),
      outcome('c', { archetype: 'explorer' }),
      outcome('d', { archetype: 'credits-roller' }),
      outcome('e', { edition: 'postcard' }),
      outcome('f', { edition: 'postcard' }),
    ])
    expect(issues).toEqual([])
  })
})

describe('grounding rates on a synthetic trail', () => {
  it('counts first-pass and after-repair over every slot asked for, the poster line included', () => {
    const repaired = outcomeOf('repaired', run({ trail: trail({ issues: { 'deck.clock': [] }, repaired: ['deck.clock'] }) }))
    expect(repaired.slots).toEqual(['deck.number', 'deck.clock', 'archetype.posterLineId'])
    expect(repaired.firstPassFailed).toEqual(['deck.clock'])
    expect(repaired.afterRepairFailed).toEqual([])

    const fellBack = outcomeOf('fell-back', run({ trail: trail({ issues: { 'deck.number': [], 'archetype.posterLineId': [] }, fallbacks: ['archetype.posterLineId'] }) }))
    const failedCall = outcomeOf('schema', run({ trail: trail({ raw: null, reason: 'SCHEMA' }) }))
    expect(failedCall.firstPassFailed).toHaveLength(3)
    expect(failedCall.afterRepairFailed).toHaveLength(3)

    // 9 slots: 1 + 2 + 3 failed first; 0 + 1 + 3 after repair
    expect(groundingRates([repaired, fellBack, failedCall])).toEqual({ firstPass: 3 / 9, afterRepair: 5 / 9 })
  })

  it('leaves out runs that never called the model', () => {
    const templates = outcomeOf('templates', run({ trail: trail({ path: 'template', raw: null, reason: 'LLM_DISABLED' }) }))
    expect(templates.slots).toEqual([])
    expect(groundingRates([templates])).toEqual({ firstPass: null, afterRepair: null })
  })
})

describe('checkRun', () => {
  it('re-grounds model slots, not templates, and reports a failed first answer', () => {
    const digit = 'You pressed play 5 times a day.'
    const report = checkRun([
      { fixture: 'model', run: run({ copy: copyWith({ number: digit }) }) },
      { fixture: 'template', run: run({ copy: copyWith({ number: digit }), trail: trail({ issues: { 'deck.number': [] }, fallbacks: ['deck.number'] }) }) },
      { fixture: 'schema', run: run({ trail: trail({ raw: null, reason: 'SCHEMA' }) }) },
    ])
    expect(report.issues.filter((i) => i.check === 'grounding').map((i) => [i.fixture, i.slot])).toEqual([['model', 'deck.number']])
    expect(report.issues.filter((i) => i.check === 'schema')).toEqual([
      { fixture: 'schema', check: 'schema', message: 'The first answer did not parse as the wire schema (SCHEMA)' },
    ])
  })
})
