/**
 * @jest-environment node
 */

/**
 * The duplicate active row audit (P11.31, DUP-05): a table with two active
 * rows is listed with each row's connection result and today's pick; a table
 * with one is not; nothing it returns or prints holds a key.
 */

import { mockReset } from 'jest-mock-extended'

import { delegateMock, prismaMock } from '@/__tests__/helpers/prisma-mock'
import type { Tautulli } from '@/lib/generated/prisma/client'
import { auditServiceRows, formatServiceRowsAudit, hostOf, testSavedRow, type RowTester } from '@/lib/services/duplicate-audit'
import { testService } from '@/lib/settings/test-service'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/settings/test-service', () => ({ testService: jest.fn() }))

const DELEGATES = ['plexServer', 'jellyfinServer', 'tautulli', 'overseerr', 'sonarr', 'radarr']
const KEY_OLD = 'tautulli-key-old-0123456789'
const KEY_NEW = 'tautulli-key-new-9876543210'

function tautulli(id: string, url: string, apiKey: string, updatedAt: string): Tautulli {
  return { id, name: `Tautulli ${id}`, url, publicUrl: null, apiKey, isActive: true, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date(updatedAt) }
}

const older = tautulli('t-old', 'http://admin:pw@tautulli.lan:8181/root?apikey=leak', KEY_OLD, '2026-03-01T00:00:00Z')
const newer = tautulli('t-new', 'https://tautulli.example.com', KEY_NEW, '2026-06-01T00:00:00Z')

beforeEach(() => {
  mockReset(prismaMock)
  for (const name of DELEGATES) delegateMock(name).findMany.mockResolvedValue([])
  // Ordered newest first, as the audit asks; today's unordered read returns the older row
  prismaMock.tautulli.findMany.mockResolvedValue([newer, older])
  prismaMock.tautulli.findFirst.mockResolvedValue({ ...older })
  prismaMock.sonarr.findMany.mockResolvedValue([{ ...newer, id: 's-1', apiKey: 'sonarr-key' }])
})

const passes = (ids: string[]): RowTester => async (_table, row) => (ids.includes(row.id) ? 'ok' : 'UNAUTHORIZED')

describe('auditServiceRows', () => {
  it('lists two active Tautulli rows with their connection results and today’s pick', async () => {
    const tables = await auditServiceRows({ test: passes(['t-old', 't-new']) })

    expect(tables).toEqual([
      {
        table: 'Tautulli',
        rows: [
          { id: 't-new', host: 'tautulli.example.com', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', connection: 'ok' },
          { id: 't-old', host: 'tautulli.lan:8181', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z', connection: 'ok' },
        ],
        todaysPickId: 't-old',
        orderedPickId: 't-new',
        suggestedKeepId: 't-old',
      },
    ])
    expect(prismaMock.tautulli.findFirst).toHaveBeenCalledWith({ where: { isActive: true }, select: { id: true } })
  })

  it('does not list a table with one active row', async () => {
    const tables = await auditServiceRows({ test: passes([]) })
    expect(tables.map((entry) => entry.table)).toEqual(['Tautulli'])
    expect(prismaMock.sonarr.findFirst).not.toHaveBeenCalled()
  })

  it('suggests a passing row when today’s pick fails its test', async () => {
    const [entry] = await auditServiceRows({ test: passes(['t-new']) })
    expect(entry.rows.map((row) => row.connection)).toEqual(['ok', 'UNAUTHORIZED'])
    expect(entry.suggestedKeepId).toBe('t-new')
  })

  it('keeps today’s pick as the suggestion when no row passes', async () => {
    const [entry] = await auditServiceRows({ test: passes([]) })
    expect(entry.suggestedKeepId).toBe('t-old')
  })

  it('returns and prints no key, token or URL user info', async () => {
    const tables = await auditServiceRows({ test: passes(['t-new']) })
    const output = JSON.stringify(tables) + formatServiceRowsAudit(tables).join('\n')
    for (const secret of [KEY_OLD, KEY_NEW, 'admin:pw', 'apikey', 'leak', '/root']) expect(output).not.toContain(secret)
    expect(output).toContain('--keep Tautulli=t-new')
  })
})

describe('testSavedRow', () => {
  it('tests the saved URL and key, and returns only the result code', async () => {
    jest.mocked(testService).mockResolvedValue({ ok: true, probe: { status: 'unreachable', code: 'TIMEOUT' } })
    await expect(testSavedRow('Tautulli', older)).resolves.toBe('TIMEOUT')
    expect(testService).toHaveBeenCalledWith({ service: 'tautulli', url: older.url, secret: KEY_OLD, query: undefined })
  })
})

describe('hostOf and formatServiceRowsAudit', () => {
  it('keeps the host and port only', () => {
    expect(hostOf('http://u:p@plex.lan:32400/path?X-Plex-Token=t')).toBe('plex.lan:32400')
    expect(hostOf('not a url')).toBe('(not a URL)')
  })

  it('says when nothing is listed', () => {
    expect(formatServiceRowsAudit([])).toEqual(['Every service has at most one active row. Nothing to apply.'])
  })
})
