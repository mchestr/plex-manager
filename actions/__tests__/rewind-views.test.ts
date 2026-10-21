/**
 * @jest-environment node
 *
 * recordRewindView (P7.14, design 7.10): ownership, one row per open,
 * `furthestPage` never decreasing, share actions counted by kind, and no
 * viewer data stored. The Prisma mock keeps a small in-memory RewindView
 * table, so the tests check what is stored.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildPlexWrapped } from '@/__tests__/helpers/factories'
import { recordRewindView } from '@/actions/rewind-views'
import { hasEntitlement } from '@/lib/actions/entitlement'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/actions/entitlement', () => ({ hasEntitlement: jest.fn(), NOT_ENTITLED_MESSAGE: 'This needs an active membership.' }))

interface ViewRow {
  wrappedId: string
  sessionKey: string
  edition: string
  furthestPage: number
  shareActions: Record<string, number>
}

const SESSION = '0b6f2a52-3c1e-4d6b-9a1f-2f4c8e9d1a20'
let views: ViewRow[]

const find = (wrappedId: string, sessionKey: string) => views.find((v) => v.wrappedId === wrappedId && v.sessionKey === sessionKey)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  views = []
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })
  jest.mocked(hasEntitlement).mockResolvedValue(true)

  prismaMock.plexWrapped.findFirst.mockImplementation((async (args: { where: { id: string; userId: string } }) =>
    args.where.id === 'wrapped-1' && args.where.userId === 'member-1'
      ? buildPlexWrapped({ id: 'wrapped-1', userId: 'member-1', status: 'completed', edition: 'full' })
      : null) as never)

  prismaMock.rewindView.createMany.mockImplementation((async (args: { data: ViewRow[] }) => {
    const [row] = args.data
    if (find(row.wrappedId, row.sessionKey)) return { count: 0 }
    views.push({ ...row })
    return { count: 1 }
  }) as never)
  prismaMock.rewindView.updateMany.mockImplementation((async (args: { where: { wrappedId: string; sessionKey: string; furthestPage: { lt: number } }; data: { furthestPage: number } }) => {
    const row = find(args.where.wrappedId, args.where.sessionKey)
    if (!row || row.furthestPage >= args.where.furthestPage.lt) return { count: 0 }
    row.furthestPage = args.data.furthestPage
    return { count: 1 }
  }) as never)

  const byKey = (where: { wrappedId_sessionKey: { wrappedId: string; sessionKey: string } }) => find(where.wrappedId_sessionKey.wrappedId, where.wrappedId_sessionKey.sessionKey)
  const tx = asTransactionClient({
    rewindView: {
      findUniqueOrThrow: async ({ where }: { where: { wrappedId_sessionKey: { wrappedId: string; sessionKey: string } } }) => byKey(where),
      update: async ({ where, data }: { where: { wrappedId_sessionKey: { wrappedId: string; sessionKey: string } }; data: { shareActions: Record<string, number> } }) => {
        const row = byKey(where)!
        row.shareActions = data.shareActions
        return row
      },
    },
  })
  prismaMock.$transaction.mockImplementation((async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) as never)
})

describe('recordRewindView', () => {
  it("refuses another member's wrappedId", async () => {
    const result = await recordRewindView({ wrappedId: 'wrapped-2', sessionKey: SESSION, page: 1 })

    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.rewindView.createMany).not.toHaveBeenCalled()
  })

  it('refuses a session key that is not a UUID', async () => {
    const result = await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: 'device-fingerprint', page: 1 })

    expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
  })

  it('creates one row for the open with the edition and no viewer data', async () => {
    expect(await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 1 })).toEqual({ success: true, data: null })

    expect(views).toEqual([{ wrappedId: 'wrapped-1', sessionKey: SESSION, edition: 'full', furthestPage: 1, shareActions: {} }])
  })

  it('raises furthestPage and never lowers it', async () => {
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 1 })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 18 })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 4 })

    expect(views).toHaveLength(1)
    expect(views[0].furthestPage).toBe(18)
  })

  it('counts share actions by kind', async () => {
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 2 })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 2, shareAction: 'image' })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 3, shareAction: 'link' })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 3, shareAction: 'image' })

    expect(views[0].shareActions).toEqual({ image: 2, link: 1 })
    expect(views[0].furthestPage).toBe(3)
  })

  it('counts a share action on the first call of an open', async () => {
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 5, shareAction: 'save' })

    expect(views[0]).toMatchObject({ furthestPage: 5, shareActions: { save: 1 } })
  })

  it('keeps each open in its own row', async () => {
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: SESSION, page: 1 })
    await recordRewindView({ wrappedId: 'wrapped-1', sessionKey: crypto.randomUUID(), page: 1 })

    expect(views).toHaveLength(2)
  })
})
