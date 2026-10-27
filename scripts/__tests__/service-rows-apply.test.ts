/**
 * @jest-environment node
 */

/**
 * `services:rows-apply` (P11.31, DUP-05) over in-memory service tables: it
 * refuses without a fresh dump or a keep for each listed table, deactivates
 * only the other rows once with one audit row, and a second run is a no-op.
 */

import { mockReset } from 'jest-mock-extended'

import { delegateMock, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { AuditEventType } from '@/lib/security/audit-log'
import { applyServiceRowKeeps } from '@/lib/services/duplicate-apply'
import { main, parseApplyArgs, type ApplyDeps } from '@/scripts/service-rows-apply'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const DELEGATES = ['plexServer', 'jellyfinServer', 'tautulli', 'overseerr', 'sonarr', 'radarr']
const NOW = Date.parse('2027-01-20T12:00:00Z')

type Row = { id: string; isActive: boolean; url: string; createdAt: Date; updatedAt: Date }
let tables: Record<string, Row[]>

function row(id: string, isActive = true): Row {
  return { id, isActive, url: 'http://service.lan', createdAt: new Date(NOW), updatedAt: new Date(NOW) }
}

/** Every delegate answers from `tables`, as Prisma would. */
function useTables() {
  for (const name of DELEGATES) {
    const delegate = delegateMock(name)
    delegate.findMany.mockImplementation(async () => (tables[name] ?? []).filter((r) => r.isActive))
    delegate.updateMany.mockImplementation(async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Row> }) => {
      const hit = (tables[name] ?? []).filter((r) => where.id.in.includes(r.id))
      for (const r of hit) Object.assign(r, data)
      return { count: hit.length }
    })
  }
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
  prismaMock.auditLog.create.mockResolvedValue({} as never)
}

let printed: string[]
const deps = (overrides: Partial<ApplyDeps> = {}): ApplyDeps => ({
  apply: applyServiceRowKeeps,
  statDump: () => ({ size: 1024, mtimeMs: NOW - 60_000 }),
  now: () => NOW,
  print: (line) => printed.push(line),
  ...overrides,
})
const DUMP = ['--dump', 'pm.dump.age']

beforeEach(() => {
  mockReset(prismaMock)
  tables = { tautulli: [row('t-1'), row('t-2'), row('t-3'), row('t-0', false)], sonarr: [row('s-1'), row('s-2')], radarr: [row('r-1')] }
  printed = []
  useTables()
})

const active = (name: string) => tables[name].filter((r) => r.isActive).map((r) => r.id)

describe('service-rows-apply', () => {
  it('refuses without a keep for each listed table, and writes nothing', async () => {
    await expect(main([...DUMP, '--keep', 'Tautulli=t-2'], deps())).resolves.toBe(1)
    expect(printed.join('\n')).toContain('no --keep: Sonarr')
    expect(prismaMock.tautulli.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
    expect(active('tautulli')).toEqual(['t-1', 't-2', 't-3'])
  })

  it('refuses a keep that is not an active row of its table', async () => {
    await expect(main([...DUMP, '--keep', 'Tautulli=t-0', '--keep', 'Sonarr=s-1'], deps())).resolves.toBe(1)
    expect(printed.join('\n')).toContain('not active rows of their table: Tautulli')
    expect(prismaMock.tautulli.updateMany).not.toHaveBeenCalled()
  })

  it('refuses without a dump taken in the last six hours', async () => {
    const keeps = ['--keep', 'Tautulli=t-2', '--keep', 'Sonarr=s-1']
    await expect(main(keeps, deps())).resolves.toBe(2)
    await expect(main([...DUMP, ...keeps], deps({ statDump: () => null }))).resolves.toBe(1)
    await expect(main([...DUMP, ...keeps], deps({ statDump: () => ({ size: 0, mtimeMs: NOW }) }))).resolves.toBe(1)
    await expect(main([...DUMP, ...keeps], deps({ statDump: () => ({ size: 9, mtimeMs: NOW - 7 * 3600_000 }) }))).resolves.toBe(1)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('deactivates only the other rows, once, with one audit row; a second run is a no-op', async () => {
    const argv = [...DUMP, '--keep', 'Tautulli=t-2', '--keep', 'Sonarr=s-1']
    await expect(main(argv, deps())).resolves.toBe(0)

    expect(active('tautulli')).toEqual(['t-2'])
    expect(active('sonarr')).toEqual(['s-1'])
    expect(active('radarr')).toEqual(['r-1'])
    expect(prismaMock.tautulli.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.tautulli.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['t-1', 't-3'] } }, data: { isActive: false } })
    expect(prismaMock.radarr.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.auditLog.create.mock.calls[0][0].data).toMatchObject({
      type: AuditEventType.SERVICE_ROWS_DEDUPED,
      actorUserId: 'script:service-rows-apply',
      details: { kept: { Tautulli: 't-2', Sonarr: 's-1' }, deactivated: { Tautulli: ['t-1', 't-3'], Sonarr: ['s-2'] }, dump: 'pm.dump.age' },
    })
    expect(printed).toEqual(['Tautulli: kept t-2, deactivated t-1, t-3', 'Sonarr: kept s-1, deactivated s-2'])

    printed = []
    await expect(main(argv, deps())).resolves.toBe(0)
    expect(printed).toEqual(['Every service already has at most one active row. Nothing changed.'])
    expect(prismaMock.tautulli.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
  })
})

describe('parseApplyArgs', () => {
  it('reads --dump and one --keep per table', () => {
    expect(parseApplyArgs([...DUMP, '--keep', 'PlexServer=p-1'])).toEqual({ ok: true, dump: 'pm.dump.age', keeps: { PlexServer: 'p-1' } })
  })

  it.each([
    [['--keep', 'Tautulli=t-1'], '--dump is required'],
    [[...DUMP, '--keep', 'Users=u-1'], 'must be <Table>=<id>'],
    [[...DUMP, '--keep', 'Tautulli='], 'must be <Table>=<id>'],
    [[...DUMP, '--keep', 'Tautulli=a', '--keep', 'Tautulli=b'], 'names Tautulli twice'],
    [[...DUMP, '--apply'], "Unknown option '--apply'"],
  ])('refuses %j', (argv, message) => {
    const parsed = parseApplyArgs(argv)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain(message)
  })
})
