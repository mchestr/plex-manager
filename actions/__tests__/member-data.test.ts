/**
 * @jest-environment node
 *
 * actions/member-data.ts (P11.15): a member deletes their own mark, watchlist
 * item or conversation. Ownership sits in the `where`, so another member's id
 * deletes nothing and returns NOT_FOUND; deleting a conversation nulls its
 * usage text but keeps the cost; the three share 60 an hour. The limiter is
 * the real one on its in-process store.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { deleteMyConversation, deleteMyMark, forgetWatchlistItem } from '@/actions/member-data'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

let counter = 0
let memberId: string

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  counter += 1
  memberId = `data-member-${counter}`
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: memberId, isAdmin: false }, expires: '2099-01-01' })
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
})

describe('deleteMyMark', () => {
  it("deletes the member's own mark and refreshes /account", async () => {
    prismaMock.userMediaMark.deleteMany.mockResolvedValue({ count: 1 })

    expect(await deleteMyMark({ markId: 'mark-1' })).toEqual({ success: true, data: null })
    expect(prismaMock.userMediaMark.deleteMany).toHaveBeenCalledWith({ where: { id: 'mark-1', userId: memberId } })
    expect(revalidatePath).toHaveBeenCalledWith('/account')
  })

  it("returns NOT_FOUND for another member's mark, which the where never matches", async () => {
    prismaMock.userMediaMark.deleteMany.mockResolvedValue({ count: 0 })

    expect(await deleteMyMark({ markId: 'someone-elses' })).toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.userMediaMark.deleteMany).toHaveBeenCalledWith({ where: { id: 'someone-elses', userId: memberId } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses a malformed id and a signed-out caller', async () => {
    expect(await deleteMyMark({ markId: '../1' })).toMatchObject({ success: false, code: 'VALIDATION' })

    jest.mocked(getServerSession).mockResolvedValue(null)
    expect(await deleteMyMark({ markId: 'mark-1' })).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(prismaMock.userMediaMark.deleteMany).not.toHaveBeenCalled()
  })

  it('holds 60 deletes an hour across the three actions', async () => {
    prismaMock.userMediaMark.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.watchlistSyncHistory.deleteMany.mockResolvedValue({ count: 1 })
    for (let i = 0; i < 30; i += 1) expect((await deleteMyMark({ markId: `mark-${i}` })).success).toBe(true)
    for (let i = 0; i < 30; i += 1) expect((await forgetWatchlistItem({ historyId: `item-${i}` })).success).toBe(true)

    expect(await deleteMyMark({ markId: 'one-more' })).toMatchObject({ success: false, code: 'RATE_LIMITED' })
    expect(prismaMock.userMediaMark.deleteMany).toHaveBeenCalledTimes(30)
  })
})

describe('forgetWatchlistItem', () => {
  it("forgets the member's own item, and NOT_FOUND for anyone else's", async () => {
    prismaMock.watchlistSyncHistory.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    expect(await forgetWatchlistItem({ historyId: 'item-1' })).toEqual({ success: true, data: null })
    expect(await forgetWatchlistItem({ historyId: 'item-2' })).toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.watchlistSyncHistory.deleteMany).toHaveBeenLastCalledWith({ where: { id: 'item-2', userId: memberId } })
  })
})

describe('deleteMyConversation', () => {
  it('nulls the text of its usage rows, keeping the cost, then deletes the conversation', async () => {
    prismaMock.lLMUsage.updateMany.mockResolvedValue({ count: 3 })
    prismaMock.chatConversation.deleteMany.mockResolvedValue({ count: 1 })

    expect(await deleteMyConversation({ conversationId: 'conv-1' })).toEqual({ success: true, data: null })
    expect(prismaMock.lLMUsage.updateMany).toHaveBeenCalledWith({
      where: { chatConversationId: 'conv-1', chatConversation: { userId: memberId } },
      data: { prompt: null, response: null },
    })
    expect(prismaMock.chatConversation.deleteMany).toHaveBeenCalledWith({ where: { id: 'conv-1', userId: memberId } })
    expect(prismaMock.lLMUsage.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.chatConversation.deleteMany.mock.invocationCallOrder[0]
    )
    expect(prismaMock.lLMUsage.deleteMany).not.toHaveBeenCalled()
  })

  it("returns NOT_FOUND for another member's conversation", async () => {
    prismaMock.lLMUsage.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.chatConversation.deleteMany.mockResolvedValue({ count: 0 })

    expect(await deleteMyConversation({ conversationId: 'conv-2' })).toMatchObject({ success: false, code: 'NOT_FOUND' })
  })
})
