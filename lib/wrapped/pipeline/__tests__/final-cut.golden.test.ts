/**
 * @jest-environment node
 */

/**
 * The final cut on all 20 golden fixtures (P8.5): each fixture runs the
 * season in dry-run mode on its hand recording, then the final cut on the
 * fixture plus its December (`evals/rewind/fixtures/december/<id>.json`)
 * with `copyPolicy: 'changed-slots'` and the season issue as the stored
 * copy. The final cut's model answers nothing (every call fails), so a call
 * is counted and its slots fall back to templates, as the dry-run script does.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Fixture } from '@/evals/rewind/fixture-schema'
import { decemberExtension, withDecember, type DecemberExtension } from '@/evals/rewind/december'
import { readRecording, replayDeps, runFixture } from '@/evals/rewind/harness'
import { FIXTURE_DIR, loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { coverCaption } from '@/lib/rewind/pages/cover'
import { renderCopyText } from '@/lib/wrapped/copy/render-copy'
import { windowLine } from '@/lib/wrapped/copy/templates'
import { RewindDataV3 } from '@/lib/wrapped/data/schema-v3'
import { validateStoredRow } from '@/lib/wrapped/maintenance/validate-year'
import type { PreviousCopy } from '@/lib/wrapped/pipeline/copy-step'
import { describeTally, planFinalCut, storedIssueOf, tallyFinalCut } from '@/lib/wrapped/pipeline/final-cut'
import type { GenerateUserResult } from '@/lib/wrapped/pipeline/generate-user'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MODEL = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const
const STALE = ['so far', 'still being written', 'data through']

function december(fixture: Fixture): DecemberExtension {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'december', `${fixture.id}.json`), 'utf8')) as DecemberExtension
}

function completed(result: GenerateUserResult) {
  if (result.status !== 'completed') throw new Error(`not completed: ${result.reason}`)
  return result
}

/** The season issue as the final cut's stored copy. */
function previousOf(data: RewindDataV3): PreviousCopy | null {
  if (!data.copy) return null
  return {
    factsHash: data.factsHash,
    promptVersion: data.copyMeta.promptVersion,
    model: data.copyMeta.model,
    copy: data.copy,
    copySource: data.copySource,
    slotHashes: data.copyMeta.slotHashes,
    issue: storedIssueOf(data),
  }
}

/** Every rendered copy string of the issue. */
function renderedCopy(data: RewindDataV3): string[] {
  if (!data.copy) return []
  const { decks, archetype, signOff } = data.copy
  return [...Object.values(decks), archetype.tagline, archetype.dedication, signOff]
    .filter((text): text is string => typeof text === 'string')
    .map((text) => renderCopyText(text, data.facts))
}

interface Outcome {
  id: string
  edition: RewindDataV3['edition']
  calls: number
  data: RewindDataV3
  season: RewindDataV3
}

async function finalCut(fixture: Fixture): Promise<Outcome> {
  const seasonReplay = replayDeps(readRecording('hand', fixture.id), MODEL)
  const season = completed((await runFixture(fixture, MODEL, seasonReplay.deps)).result).data

  const failing = replayDeps({ fixture: fixture.id, promptVersion: 'rewind-2026.1', calls: Array.from({ length: 10 }, () => ({ kind: 'copy' as const, finishReason: 'error' as const })) }, MODEL)
  const { result } = await runFixture(withDecember(fixture, december(fixture)), MODEL, failing.deps, {
    copyPolicy: 'changed-slots',
    previous: previousOf(season),
  })
  const data = completed(result).data
  return { id: fixture.id, edition: data.edition, calls: failing.next(), data, season }
}

const fixtures = loadFixtures()
let outcomes: Outcome[]

beforeAll(async () => {
  outcomes = []
  for (const fixture of fixtures) outcomes.push(await finalCut(fixture))
}, 120_000)

it('runs all twenty fixtures, on Decembers that match their builder', () => {
  expect(outcomes).toHaveLength(20)
  for (const fixture of fixtures) expect(december(fixture)).toEqual(decemberExtension(fixture))
})

it('re-calls the model for fewer than 30% of the fixtures: the two written Decembers and a close race', () => {
  const plans = outcomes.map((o) => ({
    plan: planFinalCut(storedIssueOf(o.season), { edition: o.data.edition, selected: o.data.pages.map((p) => p.type), facts: o.data.facts }),
  }))
  const recalled = outcomes.filter((o) => o.calls > 0)
  expect(recalled.length / outcomes.length).toBeLessThan(0.3)
  // zero-films' late November tilts a near tie between its top two series.
  expect(recalled.map((o) => o.id).sort()).toEqual(['heavy', 'night-owl', 'zero-films'])
  expect(plans[outcomes.findIndex((o) => o.id === 'night-owl')].plan.slots).toContainEqual({
    slot: 'deck.clock',
    action: 'regenerate',
    reason: 'band-crossed',
    fact: 'hours.afterDarkShare',
  })
  expect(describeTally(tallyFinalCut(plans))).toMatchSnapshot()
})

it('keeps every slot of a member whose numbers only grew', () => {
  const steady = outcomes.find((o) => o.id === 'single-title')!
  expect(steady.calls).toBe(0)
  expect(steady.data.copy).toEqual(steady.season.copy)
})

it('parses every result as RewindDataV3, with the full-year window, and the validator passes it', () => {
  for (const { id, data } of outcomes) {
    expect({ id, ok: RewindDataV3.safeParse(data).success, finalCut: data.window.finalCut }).toEqual({ id, ok: true, finalCut: true })
    const codes = validateStoredRow({ id, userId: 'fixture-user', status: 'completed', data: JSON.stringify(data), finalCutAt: new Date() }, { year: 2026, finalCut: true })
    expect({ id, codes }).toEqual({ id, codes: [] })
  }
})

it('leaves no season wording: no "so far", "still being written" or "Data through", and the cover reads "Final cut"', () => {
  for (const { id, data } of outcomes) {
    const strings = [...renderedCopy(data), windowLine(data.facts), coverCaption(true)].map((s) => s.toLowerCase())
    expect({ id, stale: strings.filter((s) => STALE.some((word) => s.includes(word))) }).toEqual({ id, stale: [] })
    expect(windowLine(data.facts)).toBe('Final cut')
  }
})

it('makes zero calls for pocket and postcard issues', () => {
  const small = outcomes.filter((o) => o.edition !== 'full')
  expect(small.length).toBeGreaterThan(0)
  for (const o of small) expect({ id: o.id, calls: o.calls }).toEqual({ id: o.id, calls: 0 })
})
