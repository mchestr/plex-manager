/**
 * @jest-environment node
 */

/**
 * `saveActiveService` and the save flow around it (P10.24, DUP-05), on an
 * in-memory Tautulli table: one active row survives every save, and a failed
 * connection test changes nothing.
 */

import { mockReset } from 'jest-mock-extended'

import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { testTautulliConnection } from '@/lib/connections/tautulli'
import type { Tautulli } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { saveActiveService } from '@/lib/services/service-config'
import { saveServiceConnection } from '@/lib/services/service-save'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/tautulli', () => ({ testTautulliConnection: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), logAuditEvent: jest.fn() }))

let rows: Tautulli[]
let nextId: number

type Where = { isActive?: boolean; url?: string; id?: string }
const matches = (row: Tautulli, where: Where) =>
  Object.entries(where).every(([key, value]) => row[key as keyof Tautulli] === value)

/** The Tautulli delegate over `rows`, as Prisma would answer. */
function useTable() {
  const table = prismaMock.tautulli
  table.findFirst.mockImplementation((async ({ where }: { where: Where }) => rows.find((row) => matches(row, where)) ?? null) as never)
  table.updateMany.mockImplementation((async ({ where, data }: { where: Where; data: Partial<Tautulli> }) => {
    const hit = rows.filter((row) => matches(row, where))
    for (const row of hit) Object.assign(row, data)
    return { count: hit.length }
  }) as never)
  table.update.mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<Tautulli> }) =>
    Object.assign(rows.find((row) => row.id === where.id) ?? {}, data)) as never)
  table.create.mockImplementation((async ({ data }: { data: Omit<Tautulli, 'id' | 'createdAt' | 'updatedAt'> }) => {
    const row: Tautulli = { ...data, publicUrl: data.publicUrl ?? null, id: `t${++nextId}`, createdAt: new Date(), updatedAt: new Date() }
    rows.push(row)
    return row
  }) as never)
}

// The mocked client stands in for the transaction's
const save = (url: string) =>
  saveActiveService('tautulli', { name: 'Tautulli', url, apiKey: 'key-123', isActive: true }, { tx: prisma })

const active = () => rows.filter((row) => row.isActive)

beforeEach(() => {
  mockReset(prismaMock)
  rows = []
  nextId = 0
  useTable()
  prismaMock.$transaction.mockImplementation((callback) => callback(asTransactionClient(prismaMock)))
  jest.mocked(testTautulliConnection).mockResolvedValue({ success: true })
})

describe('saveActiveService', () => {
  it('updates the row for a re-saved URL, leaving exactly one row, active', async () => {
    await save('http://tautulli.lan:8181')
    await save('http://tautulli.lan:8181')

    expect(rows).toHaveLength(1)
    expect(active()).toEqual([expect.objectContaining({ id: 't1', url: 'http://tautulli.lan:8181' })])
  })

  it('deactivates the old row when a new URL is saved', async () => {
    await save('http://wrong.lan:8181')
    const saved = await save('http://tautulli.lan:8181')

    expect(saved).toMatchObject({ id: 't2', isActive: true })
    expect(rows.map((row) => [row.url, row.isActive])).toEqual([
      ['http://wrong.lan:8181', false],
      ['http://tautulli.lan:8181', true],
    ])
  })

  it('reactivates an earlier address instead of copying it', async () => {
    await save('http://first.lan:8181')
    await save('http://second.lan:8181')
    await save('http://first.lan:8181')

    expect(rows).toHaveLength(2)
    expect(active()).toEqual([expect.objectContaining({ id: 't1' })])
  })

  it('leaves one active row where earlier saves left two', async () => {
    rows.push(
      { id: 'old-1', name: 'A', url: 'http://a.lan', publicUrl: null, apiKey: 'k', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 'old-2', name: 'B', url: 'http://b.lan', publicUrl: null, apiKey: 'k', isActive: true, createdAt: new Date(), updatedAt: new Date() }
    )

    await save('http://b.lan')

    expect(active().map((row) => row.id)).toEqual(['old-2'])
  })
})

describe('saveServiceConnection', () => {
  it('writes nothing when the connection test fails', async () => {
    await save('http://tautulli.lan:8181')
    const before = structuredClone(rows)
    jest.mocked(testTautulliConnection).mockResolvedValue({ success: false, error: 'Connection refused' })

    const result = await saveServiceConnection(
      'tautulli',
      { name: 'Tautulli', url: 'http://elsewhere.lan:8181', apiKey: 'new-key' },
      { actor: 'admin-1', section: 'tautulli' }
    )

    expect(result).toMatchObject({ success: false, code: 'UPSTREAM_UNAVAILABLE' })
    expect(rows).toEqual(before)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('runs the caller\'s writes in the same transaction as the row', async () => {
    const within = jest.fn().mockResolvedValue(undefined)

    await expect(
      saveServiceConnection('tautulli', { name: 'Tautulli', url: 'http://tautulli.lan:8181', apiKey: 'key-123' }, { actor: 'setup', section: 'setup.tautulli', within })
    ).resolves.toEqual({ success: true, data: null })

    expect(within).toHaveBeenCalledWith(prismaMock)
    expect(active()).toHaveLength(1)
  })
})
