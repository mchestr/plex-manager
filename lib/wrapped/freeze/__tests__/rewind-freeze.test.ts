/**
 * @jest-environment node
 */

/**
 * The freeze lock (P8.1): every hash recomputed from the code matches the
 * committed lock, a drift names its section, and what the lock leaves out
 * (headlines) never trips it.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { COPY_SLOTS } from '@/lib/wrapped/copy/slots'
import { frozenModelFor, REWIND_LOCK, type LockModel } from '@/lib/wrapped/freeze/lock'
import { driftOf, FREEZE_SECTIONS, freezeInputs, hashFreezeInputs, type FreezeInputs } from '@/lib/wrapped/freeze/sections'
import { PROMPT_VERSION } from '@/lib/wrapped/prompt/rewind-2026'
import { selectedLockModel } from '@/scripts/rewind-freeze'

const ROOT = path.resolve(__dirname, '../../../..')
const selected = selectedLockModel(readFileSync(path.join(ROOT, 'evals/rewind/selected.json'), 'utf8'))
const inputs = () => freezeInputs(REWIND_LOCK.model)
const drift = (changed: FreezeInputs) => driftOf(REWIND_LOCK.hashes, hashFreezeInputs(changed))

const MODEL: LockModel = { provider: 'anthropic', modelId: 'claude-sonnet-5-5', budgetModelId: 'claude-haiku-5-5', effort: 'low', maxOutputTokens: 1800 }

describe('the committed lock', () => {
  it('is rewind-2026.1, frozen on 1 December, with a hash for every section', () => {
    expect(REWIND_LOCK.version).toBe(PROMPT_VERSION)
    expect(PROMPT_VERSION).toBe('rewind-2026.1')
    expect(REWIND_LOCK.frozenAt).toBe('2026-12-01')
    expect(Object.keys(REWIND_LOCK.hashes).sort()).toEqual([...FREEZE_SECTIONS].sort())
    expect(REWIND_LOCK.changes.every((change) => change.reason.length > 0)).toBe(true)
  })

  it('matches every hash recomputed from the code, and the model in selected.json', () => {
    expect(drift(inputs())).toEqual([])
    expect(REWIND_LOCK.model).toEqual(selected)
  })

  it('locks copy slots with no window.finalCut identity (P8.5)', () => {
    for (const slot of Object.values(COPY_SLOTS)) expect(slot.identity).not.toContain('window.finalCut')
  })
})

describe('a drift names its section', () => {
  it('fails on one changed word of the system block', () => {
    const changed = inputs()
    changed.systemPrompt = String(changed.systemPrompt).replace('warm, specific', 'warm, vivid')
    expect(changed.systemPrompt).not.toBe(inputs().systemPrompt)
    expect(drift(changed)).toEqual(['systemPrompt changed'])
  })

  it('fails on a new fact id', () => {
    const changed = inputs()
    const catalogue = changed.catalogue as { version: string; facts: object[] }
    changed.catalogue = { ...catalogue, facts: [...catalogue.facts, { id: 'time.newFact', group: 'time', unit: 'hours', format: '1' }] }
    expect(drift(changed)).toEqual(['catalogue changed'])
  })

  it('fails on a moved band threshold', () => {
    const changed = inputs()
    changed.copySlots = (changed.copySlots as Array<{ id: string; bands: Array<{ fact: string; at: number[] }> }>).map((slot) =>
      slot.id === 'deck.number' ? { ...slot, bands: [{ fact: 'time.seriesShare', at: [0.6] }] } : slot
    )
    expect(drift(changed)).toEqual(['copySlots changed'])
  })

  it('fails on another model', () => {
    expect(drift(freezeInputs({ ...MODEL, modelId: 'claude-opus-5-5' }))).toContain('model changed')
  })

  it('passes a headline change, which the lock leaves out', () => {
    const before = hashFreezeInputs(inputs())
    jest.isolateModules(() => {
      jest.doMock('@/lib/wrapped/copy/templates', () => ({
        ...jest.requireActual('@/lib/wrapped/copy/templates'),
        headline: () => 'A new headline',
      }))
      const sections = require('@/lib/wrapped/freeze/sections') as typeof import('@/lib/wrapped/freeze/sections')
      const lock = require('@/lib/wrapped/freeze/lock') as typeof import('@/lib/wrapped/freeze/lock')
      expect(sections.hashFreezeInputs(sections.freezeInputs(lock.REWIND_LOCK.model))).toEqual(before)
    })
  })
})

describe('frozenModelFor', () => {
  it('is null without an active row', () => {
    expect(frozenModelFor(null, MODEL)).toBeNull()
  })

  it("keeps the row's own model until the lock names one", () => {
    expect(frozenModelFor({ provider: 'openai', model: 'gpt-6-sol' }, null)).toEqual({
      status: 'unfrozen', provider: 'openai', model: 'gpt-6-sol', budgetModel: undefined, rowModel: 'gpt-6-sol',
    })
  })

  it("runs the lock's model and budget model on the row's provider", () => {
    expect(frozenModelFor({ provider: 'anthropic', model: 'claude-opus-5-5' }, MODEL)).toEqual({
      status: 'frozen', provider: 'anthropic', model: 'claude-sonnet-5-5', budgetModel: 'claude-haiku-5-5', rowModel: 'claude-opus-5-5',
    })
  })

  it('reports a row on another provider as a mismatch', () => {
    expect(frozenModelFor({ provider: 'openai', model: 'gpt-6-sol' }, MODEL)).toEqual({ status: 'mismatch', provider: 'openai', locked: MODEL })
  })
})
