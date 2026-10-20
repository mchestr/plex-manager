/**
 * @jest-environment node
 */

/**
 * CI's offline eval (P5.13): every committed recording set in
 * `evals/rewind/recordings/` replays through the real pipeline with
 * `fetch` stubbed to throw, and `checks.ts` runs over the outputs. Only the
 * set of the model named in `selected.json` can fail the job: its gates
 * must pass with 98% or more first-pass grounding over all 20 fixtures.
 * Every other set (the hand-written one, other candidates) is checked and
 * reported, never failed.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

import { checkRun } from '../checks'
import { readRecording, RECORDINGS_DIR, recordingSets, replayDeps, runFixture } from '../harness'
import { parseModelRef, slugFor, type ModelRef } from '../model-ref'
import { FIRST_PASS_GATE } from '../select-model'
import { loadFixtures } from './load-fixtures'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const selectedSchema = z.object({
  model: z.string().nullable(),
  economy: z.string().nullable(),
  effort: z.string(),
  promptVersion: z.string(),
  decidedOn: z.string().nullable(),
  note: z.string().optional(),
})

const selected = selectedSchema.parse(JSON.parse(readFileSync(path.join(__dirname, '..', 'selected.json'), 'utf8')))
const fixtures = loadFixtures()
const HAND_MODEL: ModelRef = { provider: 'anthropic', id: 'claude-sonnet-5-5' }

const realFetch = global.fetch
beforeAll(() => {
  global.fetch = jest.fn(async () => {
    throw new Error('The recordings test must not touch the network')
  })
})
afterAll(() => {
  global.fetch = realFetch
})

async function checkSet(set: string) {
  const present = fixtures.filter((f) => existsSync(path.join(RECORDINGS_DIR, set, `${f.id}.json`)))
  const runs = []
  for (const fixture of present) {
    const recording = readRecording(set, fixture.id)
    const model = recording.model ? parseModelRef(recording.model) : HAND_MODEL
    const { result } = await runFixture(fixture, model, replayDeps(recording, model).deps)
    if (result.status !== 'completed') throw new Error(`${set}/${fixture.id} was skipped`)
    runs.push({
      fixture: fixture.id,
      run: { edition: result.data.edition, pages: result.data.pages.map((p) => p.type), archetype: result.data.archetype, facts: result.data.facts, copy: result.data.copy, trail: result.trail.copy },
    })
  }
  return { fixtures: present.map((f) => f.id), report: checkRun(runs) }
}

it('names the selected model, if any, with a committed recording set', () => {
  if (selected.model === null) return
  expect(recordingSets()).toContain(slugFor(selected.model))
  expect(selected.promptVersion).toBe(readRecording(slugFor(selected.model), fixtures[0].id).promptVersion)
})

it('catches the hand set\'s deliberate failures', async () => {
  const { report } = await checkSet('hand')
  expect(report.issues).toContainEqual(expect.objectContaining({ fixture: 'zero-series', check: 'schema' }))
  expect(report.rates.firstPass).toBeLessThan(FIRST_PASS_GATE)
  expect(report.rates.afterRepair).toBeGreaterThan(report.rates.firstPass!)
})

describe.each(recordingSets().map((set) => [set] as const))('recordings/%s', (set) => {
  const isSelected = selected.model !== null && slugFor(selected.model) === set

  it(isSelected ? 'passes every gate (selected model)' : 'is checked offline (advisory)', async () => {
    const { fixtures: covered, report } = await checkSet(set)
    expect(covered.length).toBeGreaterThan(0)
    expect(global.fetch).not.toHaveBeenCalled()
    if (!isSelected) {
      expect(report.rates.firstPass === null || report.rates.firstPass <= 1).toBe(true)
      return
    }
    expect(covered).toEqual(fixtures.map((f) => f.id))
    expect(report.issues).toEqual([])
    expect(report.rates.firstPass).toBeGreaterThanOrEqual(FIRST_PASS_GATE)
  })
})
