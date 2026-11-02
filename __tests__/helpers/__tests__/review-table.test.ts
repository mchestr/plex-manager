/**
 * @jest-environment node
 */

/**
 * The in-memory review table (`__tests__/helpers/review-table.ts`): it applies
 * the filters and orders it understands the way Postgres would, and throws on
 * any other, so a test cannot pass because a query it does not understand
 * matched no row (final review F10).
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { useReviewTable } from '@/__tests__/helpers/review-table'
import type { Prisma } from '@/lib/generated/prisma/client'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

const AT = (minute: number) => new Date(Date.UTC(2026, 10, 1, 12, minute))

beforeEach(() => mockReset(prismaMock))

function seed() {
  return useReviewTable([
    { id: 'old', conversationId: 'c1', status: 'failed', errorCode: 'STALE', createdAt: AT(0), startedAt: AT(1) },
    { id: 'mid', conversationId: 'c1', status: 'running', errorCode: null, createdAt: AT(5), startedAt: AT(6), runToken: 2 },
    { id: 'new', conversationId: 'c2', status: 'queued', errorCode: null, createdAt: AT(9), startedAt: null },
  ])
}

const ids = (rows: Array<{ id?: string }>) => rows.map((row) => row.id)

describe('useReviewTable', () => {
  it('filters by equality, null, a Date, { in } and { lt }, and orders by one desc key', async () => {
    seed()
    const reviews = prismaMock.conversationReview

    await expect(reviews.findMany({ where: { conversationId: 'c1' }, orderBy: { createdAt: 'desc' } })).resolves.toMatchObject([{ id: 'mid' }, { id: 'old' }])
    expect(ids(await reviews.findMany({ where: { startedAt: null } }))).toEqual(['new'])
    expect(ids(await reviews.findMany({ where: { createdAt: AT(5) } }))).toEqual(['mid'])
    expect(ids(await reviews.findMany({ where: { status: { in: ['queued', 'running'] } }, orderBy: { createdAt: 'desc' } }))).toEqual(['new', 'mid'])
    expect(ids(await reviews.findMany({ where: { startedAt: { lt: AT(6) } } }))).toEqual(['old'])
    await expect(reviews.findFirst({ where: { errorCode: null }, orderBy: { createdAt: 'desc' } })).resolves.toMatchObject({ id: 'new' })
    expect(ids(await reviews.findMany({ orderBy: { startedAt: 'desc' }, take: 2 }))).toEqual(['mid', 'old'])
  })

  it('applies a conditional updateMany, { increment } included', async () => {
    const rows = seed()

    await expect(
      prismaMock.conversationReview.updateMany({ where: { id: 'mid', status: 'running', runToken: 2 }, data: { status: 'queued', runToken: { increment: 1 } } })
    ).resolves.toEqual({ count: 1 })
    await expect(prismaMock.conversationReview.updateMany({ where: { id: 'mid', status: 'running' }, data: { status: 'failed' } })).resolves.toEqual({ count: 0 })

    expect(rows.get('mid')).toMatchObject({ status: 'queued', runToken: 3 })
  })

  it.each<[string, Prisma.ConversationReviewWhereInput]>([
    ['{ not: null }', { errorCode: { not: null } }],
    ['{ gte }', { startedAt: { gte: AT(0) } }],
    ['{ lte }', { createdAt: { lte: AT(9) } }],
    ['{ equals }', { status: { equals: 'running' } }],
    ['{ in } beside { lt }', { createdAt: { in: [AT(0)], lt: AT(9) } }],
    ['{ lt } with a number', { runToken: { lt: 3 } }],
    ['a relation filter', { conversation: { endedAt: null } }],
    ['OR', { OR: [{ status: 'queued' }, { status: 'running' }] }],
  ])('throws on a condition it does not understand: %s', async (_name, where) => {
    seed()

    await expect(prismaMock.conversationReview.findMany({ where })).rejects.toThrow('useReviewTable does not understand the condition')
    await expect(prismaMock.conversationReview.findFirst({ where })).rejects.toThrow('useReviewTable does not understand the condition')
    await expect(prismaMock.conversationReview.updateMany({ where, data: { status: 'failed' } })).rejects.toThrow('useReviewTable does not understand the condition')
  })

  it.each<[string, Prisma.ConversationReviewFindManyArgs['orderBy']]>([
    ['an asc key', { createdAt: 'asc' }],
    ['two keys', { createdAt: 'desc', id: 'desc' }],
    ['an array', [{ createdAt: 'desc' }]],
    ['no key', {}],
  ])('throws on an orderBy other than one desc key: %s', async (_name, orderBy) => {
    seed()

    await expect(prismaMock.conversationReview.findMany({ orderBy })).rejects.toThrow('useReviewTable orders by one desc key only')
    await expect(prismaMock.conversationReview.findFirst({ orderBy })).rejects.toThrow('useReviewTable orders by one desc key only')
  })
})
