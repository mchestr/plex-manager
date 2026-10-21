/**
 * @jest-environment node
 */

/**
 * The final-cut report (P8.10): its arguments, the re-call rate and its
 * verdicts, the reasons, cost and timings, and the Tautulli 429 count.
 */

import type { FinalCutPlan } from '@/lib/wrapped/pipeline/final-cut'
import { countTautulli429s, formatReport, main, parseReportArgs, planOf, type GenerationRow, type ReportDeps } from '@/scripts/rewind-final-cut-report'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const KEEP: FinalCutPlan = { slots: [{ slot: 'deck.number', action: 'keep' }], keep: ['deck.number'], regenerate: [] }
const BAND: FinalCutPlan = {
  slots: [{ slot: 'deck.number', action: 'regenerate', reason: 'band-crossed', fact: 'hours.afterDarkShare' }],
  keep: [],
  regenerate: ['deck.number'],
}

function row(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    status: 'completed',
    code: null,
    llmCalls: 0,
    costUsd: 0,
    createdAt: new Date('2026-12-11T18:00:00Z'),
    startedAt: new Date('2026-12-11T18:01:00Z'),
    finishedAt: new Date('2026-12-11T18:01:10Z'),
    edition: 'full',
    plan: KEEP,
    ...overrides,
  }
}

/** Ten members, the first `recalls` of whom re-call. */
function rows(recalls: number): GenerationRow[] {
  return Array.from({ length: 10 }, (_, i) =>
    i < recalls ? row({ llmCalls: 1, costUsd: 0.004, plan: BAND, finishedAt: new Date('2026-12-11T18:21:00Z') }) : row()
  )
}

describe('parseReportArgs', () => {
  it('needs a year, reads --since and --log, and keeps --warn under the pass mark', () => {
    expect(parseReportArgs(['--year=2026'])).toEqual({ ok: true, args: { year: 2026, since: null, log: null, warn: 0.2 } })
    const parsed = parseReportArgs(['--year=2026', '--since=2026-12-11T18:00:00Z', '--log=w.log', '--warn=25'])
    expect(parsed).toEqual({ ok: true, args: { year: 2026, since: new Date('2026-12-11T18:00:00Z'), log: 'w.log', warn: 0.25 } })
    expect(parseReportArgs([])).toMatchObject({ ok: false })
    expect(parseReportArgs(['--year=2026', '--since=soon'])).toMatchObject({ ok: false })
    expect(parseReportArgs(['--year=2026', '--warn=30'])).toMatchObject({ ok: false })
  })
})

describe('formatReport', () => {
  it('passes under the warning, and names the reasons, the cost and the timings', () => {
    const { lines, pass } = formatReport(rows(1), { year: 2026, warn: 0.2 }, null)
    expect(pass).toBe(true)
    expect(lines).toContain('Re-call rate: 1 of 10 (10.0%), pass.')
    expect(lines).toContain('Full editions: 1 of 10 re-call (10.0%).')
    expect(lines).toContain('Slot plan: 9 of 10 keep all copy, 1 re-call (band-crossed: hours.afterDarkShare).')
    expect(lines).toContain('  band-crossed: hours.afterDarkShare: 1 slot')
    expect(lines.find((l) => l.startsWith('Cost:'))).toMatch(/per completed member/)
    expect(lines).toContain('Timings: 21.0 min from the first enqueue to the last completion; per member median 10.0 s, p95 1200.0 s.')
    expect(lines).toContain('Tautulli 429s: not counted (pass --log with a LOG_LEVEL=debug worker log).')
  })

  it('warns above --warn, and fails at 30% or with a failed generation', () => {
    expect(formatReport(rows(2), { year: 2026, warn: 0.15 }, 0).lines).toContain('Re-call rate: 2 of 10 (20.0%), pass, but above the 15% warning.')
    const over = formatReport(rows(3), { year: 2026, warn: 0.2 }, 0)
    expect(over.pass).toBe(false)
    expect(over.lines).toContain('Re-call rate: 3 of 10 (30.0%), FAIL, at or above the 30% pass mark.')

    const failed = formatReport([...rows(0), row({ status: 'failed', code: 'TAUTULLI_ERROR' }), row({ status: 'skipped', code: 'JOINED_LATE' })], { year: 2026, warn: 0.2 }, 2)
    expect(failed.pass).toBe(false)
    expect(failed.lines).toEqual(expect.arrayContaining(['Failed: TAUTULLI_ERROR 1.', 'Skipped: JOINED_LATE 1.', 'Tautulli 429s: 2.']))
  })
})

describe('countTautulli429s', () => {
  it("counts Tautulli's 429 lines in a JSON log, with or without a docker prefix", () => {
    const log = [
      '{"level":"debug","message":"Tautulli request failed","metadata":{"service":"Tautulli","code":"HTTP","status":429}}',
      'app-1  | {"level":"debug","message":"Tautulli request failed","metadata":{"service":"Tautulli","code":"HTTP","status":429}}',
      '{"level":"debug","message":"Plex request failed","metadata":{"service":"Plex","code":"HTTP","status":429}}',
      '{"level":"warn","message":"Tautulli request failed","metadata":{"service":"Tautulli","code":"HTTP","status":503}}',
      'not json {',
    ].join('\n')
    expect(countTautulli429s(log)).toBe(2)
  })
})

describe('planOf', () => {
  it('reads nothing from a row that is not v3', () => {
    expect(planOf(null, '{}')).toEqual({ edition: null, plan: null })
  })
})

describe('main', () => {
  function deps(found: GenerationRow[]) {
    const lines: string[] = []
    const all: ReportDeps = { loadGenerations: jest.fn(async () => found), readLog: jest.fn(() => ''), print: (l) => lines.push(l) }
    return { all, lines }
  }

  it('exits 0 on a pass, 1 with nothing to measure, and 2 on bad arguments', async () => {
    const ok = deps(rows(1))
    expect(await main(['--year=2026', '--log=w.log'], ok.all)).toBe(0)
    expect(ok.all.readLog).toHaveBeenCalledWith('w.log')
    expect(ok.lines).toContain('Tautulli 429s: 0.')

    const none = deps([])
    expect(await main(['--year=2026'], none.all)).toBe(1)
    expect(none.lines).toEqual(['No final-cut generations for 2026.'])

    expect(await main(['--year=soon'], deps([]).all)).toBe(2)
  })
})
