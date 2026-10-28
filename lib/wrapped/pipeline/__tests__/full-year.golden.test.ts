/**
 * @jest-environment node
 */

/**
 * A Rewind generated after the year has ended, on all 20 golden fixtures:
 * each fixture plus its December (`evals/rewind/fixtures/december/<id>.json`)
 * runs in dry-run mode on the whole-year window with `copyPolicy: 'default'`
 * and no stored issue. The model answers nothing (every call fails), so the
 * copy is the templates, as a run without a model writes it. Each issue
 * reads as finished: no wording says the year is still going.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Fixture } from '@/evals/rewind/fixture-schema'
import { decemberExtension, withDecember, type DecemberExtension } from '@/evals/rewind/december'
import { replayDeps, runFixture } from '@/evals/rewind/harness'
import { FIXTURE_DIR, loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { COVER_CAPTION } from '@/lib/rewind/pages/cover'
import { renderCopyText } from '@/lib/wrapped/copy/render-copy'
import { windowLine } from '@/lib/wrapped/copy/templates'
import { RewindDataV3 } from '@/lib/wrapped/data/schema-v3'
import { validateStoredRow } from '@/lib/wrapped/maintenance/validate-year'
import type { GenerateUserResult } from '@/lib/wrapped/pipeline/generate-user'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MODEL = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const
const UNFINISHED = ['so far', 'final cut', 'still being written']

function december(fixture: Fixture): DecemberExtension {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'december', `${fixture.id}.json`), 'utf8')) as DecemberExtension
}

function completed(result: GenerateUserResult) {
  if (result.status !== 'completed') throw new Error(`not completed: ${result.reason}`)
  return result
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
}

async function wholeYear(fixture: Fixture): Promise<Outcome> {
  const failing = replayDeps({ fixture: fixture.id, promptVersion: 'rewind-2026.1', calls: Array.from({ length: 10 }, () => ({ kind: 'copy' as const, finishReason: 'error' as const })) }, MODEL)
  const { result } = await runFixture(withDecember(fixture, december(fixture)), MODEL, failing.deps, { copyPolicy: 'default' })
  const data = completed(result).data
  return { id: fixture.id, edition: data.edition, calls: failing.next(), data }
}

const fixtures = loadFixtures()
let outcomes: Outcome[]

beforeAll(async () => {
  outcomes = []
  for (const fixture of fixtures) outcomes.push(await wholeYear(fixture))
}, 120_000)

it('runs all twenty fixtures, on Decembers that match their builder', () => {
  expect(outcomes).toHaveLength(20)
  for (const fixture of fixtures) expect(december(fixture)).toEqual(decemberExtension(fixture))
})

it('parses every result as RewindDataV3, with the whole-year window, and the validator passes it', () => {
  for (const { id, data } of outcomes) {
    expect({ id, ok: RewindDataV3.safeParse(data).success, finalCut: data.window.finalCut, through: data.window.through }).toEqual({
      id,
      ok: true,
      finalCut: true,
      through: '2026-12-31',
    })
    const codes = validateStoredRow({ id, userId: 'fixture-user', status: 'completed', data: JSON.stringify(data) })
    expect({ id, codes }).toEqual({ id, codes: [] })
  }
})

it('writes template copy for every full issue when the model answers nothing', () => {
  const full = outcomes.filter((o) => o.edition === 'full')
  expect(full.length).toBeGreaterThan(0)
  for (const o of full) expect({ id: o.id, calls: o.calls, source: o.data.copySource }).toEqual({ id: o.id, calls: 1, source: 'template' })
})

it('reads as finished: no "so far", "final cut" or "still being written" in any copy, the window line or the cover', () => {
  for (const { id, data } of outcomes) {
    const strings = [...renderedCopy(data), renderCopyText(windowLine(), data.facts), COVER_CAPTION].map((s) => s.toLowerCase())
    expect({ id, unfinished: strings.filter((s) => UNFINISHED.some((word) => s.includes(word))) }).toEqual({ id, unfinished: [] })
  }
})

it('makes zero calls for pocket and postcard issues', () => {
  const small = outcomes.filter((o) => o.edition !== 'full')
  expect(small.length).toBeGreaterThan(0)
  for (const o of small) expect({ id: o.id, calls: o.calls }).toEqual({ id: o.id, calls: 0 })
})
