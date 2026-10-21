/**
 * @jest-environment node
 */

/**
 * The freeze script (P8.1): `--check` passes on the committed files and exits
 * 1 on drift, `--write` refuses a changed lock once frozen, and a locked model
 * must be priced, structured and still served on 2027-01-02.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { lookupModel } from '@/lib/llm/models'
import { LOCK_PATH } from '@/lib/wrapped/freeze/lock'
import { main, modelProblems, selectedLockModel, type FreezeDeps } from '@/scripts/rewind-freeze'

const ROOT = path.resolve(__dirname, '../..')
const SELECTED = 'evals/rewind/selected.json'
const SONNET = JSON.stringify({ model: 'anthropic:claude-sonnet-5-5', economy: null, effort: 'low' })

function deps(files: Record<string, string | null>, today = '2026-11-30') {
  const lines: string[] = []
  const written: Record<string, string> = {}
  const d: FreezeDeps = {
    readFile: (relative) => (relative in files ? files[relative] : readFileSync(path.join(ROOT, relative), 'utf8')),
    writeFile: (relative, text) => {
      written[relative] = text
    },
    today: () => today,
    print: (line) => lines.push(line),
  }
  return { d, lines, written }
}

describe('--check', () => {
  it('passes on the committed lock', () => {
    const { d, lines } = deps({})
    expect(main(['--check'], d)).toBe(0)
    expect(lines.join('\n')).toContain('matches')
  })

  it('exits 1 on drift and names the section', () => {
    const lock = JSON.parse(readFileSync(path.join(ROOT, LOCK_PATH), 'utf8'))
    lock.hashes.systemPrompt = '0'.repeat(64)
    const { d, lines } = deps({ [LOCK_PATH]: JSON.stringify(lock) })
    expect(main(['--check'], d)).toBe(1)
    expect(lines).toContain('  systemPrompt changed')
  })

  it('exits 1 when selected.json names a model the lock does not hold', () => {
    const { d, lines } = deps({ [SELECTED]: SONNET })
    expect(main(['--check'], d)).toBe(1)
    expect(lines).toContain('  model changed')
  })

  it('exits 1 without a lock', () => {
    const { d } = deps({ [LOCK_PATH]: null })
    expect(main(['--check'], d)).toBe(1)
  })
})

describe('--write', () => {
  it('needs a reason', () => {
    const { d } = deps({})
    expect(main(['--write'], d)).toBe(2)
  })

  it('writes the selected model before the lock freezes, keeping the reasons', () => {
    const { d, written } = deps({ [SELECTED]: SONNET }, '2026-11-30')
    expect(main(['--write', '--reason=Bake-off winner'], d)).toBe(0)
    const lock = JSON.parse(written[LOCK_PATH])
    expect(lock.model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-5-5', budgetModelId: 'claude-haiku-5-5', effort: 'low', maxOutputTokens: 1800 })
    expect(lock.changes.at(-1)).toEqual({ on: '2026-11-30', reason: 'Bake-off winner' })
    expect(lock.changes.length).toBeGreaterThan(1)
  })

  it('refuses a changed lock under the same version once frozen', () => {
    const { d, lines, written } = deps({ [SELECTED]: SONNET }, '2026-12-01')
    expect(main(['--write', '--reason=Late change'], d)).toBe(1)
    expect(lines.join('\n')).toContain('Bump PROMPT_VERSION')
    expect(written).toEqual({})
  })
})

describe('the locked model', () => {
  it('is priced, writes structured output and does not retire before 2027-01-02', () => {
    const model = selectedLockModel(SONNET)!
    expect(modelProblems(model)).toEqual([])
    const info = lookupModel(model.provider, model.modelId)
    expect(info.pricing).not.toBeNull()
    expect(info.capabilities.structuredOutputs).toBe(true)
    expect(info.retiresOn === null || info.retiresOn > '2027-01-02').toBe(true)
  })

  it('refuses an unknown model', () => {
    const model = selectedLockModel(JSON.stringify({ model: 'openai-compatible:qwen3.6:27b', economy: null, effort: 'low' }))!
    expect(modelProblems(model)).toEqual(expect.arrayContaining([expect.stringContaining('has no price')]))
  })

  it('is null until the bake-off names one', () => {
    expect(selectedLockModel(JSON.stringify({ model: null, economy: null, effort: 'low' }))).toBeNull()
  })
})
