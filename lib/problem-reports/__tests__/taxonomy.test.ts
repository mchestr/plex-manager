/**
 * The problem taxonomy: every problem has member copy, a kind and a
 * suggested fix, and the kinds a title offers depend on its type.
 */

import { kindsFor, needsNote, PROBLEM_CODES, PROBLEM_KINDS, PROBLEMS, problemLabel, problemsOf } from '@/lib/problem-reports/taxonomy'

const FIXES = ['SWAP', 'BETTER_COPY', 'LOOK_FOR_MISSING', 'FIX_MATCH', 'REFRESH', 'ADMIN']

describe('problem taxonomy', () => {
  it.each(PROBLEM_CODES)('%s has copy, a known kind and a suggested fix', (code) => {
    const problem = PROBLEMS[code]
    expect(problem.label.trim()).not.toBe('')
    expect(PROBLEM_KINDS.map((kind) => kind.id)).toContain(problem.kind)
    expect(FIXES).toContain(problem.fix)
  })

  it.each(PROBLEM_KINDS.map((kind) => [kind.id, kind] as const))('the %s kind has copy and problems', (_id, kind) => {
    expect(kind.label.trim()).not.toBe('')
    expect(problemsOf(kind.id).length).toBeGreaterThan(0)
  })

  it('keeps every label free of middots and arrows', () => {
    const copy = [...PROBLEM_KINDS.map((kind) => kind.label), ...PROBLEM_CODES.map((code) => PROBLEMS[code].label)]
    expect(copy.filter((text) => /[·→←]/.test(text))).toEqual([])
  })

  it('offers missing episodes and episode order for shows and episodes only', () => {
    expect(kindsFor('movie').map((kind) => kind.id)).not.toContain('episodes')
    expect(kindsFor('show').map((kind) => kind.id)).toContain('episodes')
    expect(kindsFor('episode').map((kind) => kind.id)).toContain('episodes')
    expect(problemsOf('episodes').map((problem) => problem.code)).toEqual(['missing_episodes', 'wrong_order'])
  })

  it('needs a note only for something else', () => {
    expect(PROBLEM_CODES.filter(needsNote)).toEqual(['other'])
  })

  it('labels an unknown code as something else', () => {
    expect(problemLabel('out_of_sync')).toBe('Sound is out of sync')
    expect(problemLabel('retired_code')).toBe('Something else')
  })
})
