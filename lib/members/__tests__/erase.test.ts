/**
 * @jest-environment node
 */

/**
 * `eraseMember` (P11.13, GAP-31), with every external call mocked: the
 * external effects run before the transaction, a dry run writes nothing,
 * each refusal returns its code, and a failure stops before the transaction
 * so that a rerun completes the removal.
 */

import { mockReset } from 'jest-mock-extended'

import { buildUser } from '@/__tests__/helpers/factories'
import { asTransactionClient, prismaMock } from '@/__tests__/helpers/prisma-mock'
import { blockPlexAccount } from '@/lib/affiliates/block'
import { clearDiscordRoleForUser } from '@/lib/discord/integration'
import { revokeServiceAccess } from '@/lib/members/access-actions'
import { eraseMember } from '@/lib/members/erase'
import { cancelStripeSubscription, removeMemberJobs } from '@/lib/members/erase-external'
import { countInventory, deleteInventory, loadEraseSubject, type InventoryCounts } from '@/lib/members/erase-inventory'
import { isPlexServerOwner } from '@/lib/members/owner'
import { AuditEventType, recordAuditEvent } from '@/lib/security/audit-log'
import { endUserSessions } from '@/lib/session-revocation'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/discord/integration', () => ({ clearDiscordRoleForUser: jest.fn() }))
jest.mock('@/lib/members/access-actions', () => ({ revokeServiceAccess: jest.fn() }))
jest.mock('@/lib/members/erase-external', () => ({
  ...jest.requireActual('@/lib/members/erase-external'),
  cancelStripeSubscription: jest.fn(),
  removeMemberJobs: jest.fn(),
}))
jest.mock('@/lib/members/erase-inventory', () => ({
  loadEraseSubject: jest.fn(),
  countInventory: jest.fn(),
  deleteInventory: jest.fn(),
}))
jest.mock('@/lib/members/owner', () => ({ isPlexServerOwner: jest.fn() }))
jest.mock('@/lib/affiliates/block', () => ({ blockPlexAccount: jest.fn() }))
jest.mock('@/lib/security/audit-log', () => ({ ...jest.requireActual('@/lib/security/audit-log'), recordAuditEvent: jest.fn() }))
jest.mock('@/lib/session-revocation', () => ({ endUserSessions: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const COUNTS = { user: 1, plexWrapped: 2, userMediaMark: 3 } as unknown as InventoryCounts
const SUBJECT = { userId: 'member-1', discordUserIds: ['discord-1'], wrappedIds: ['w-1'], generationIds: ['g-1'] }
const TX = asTransactionClient({})

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    ...buildUser({ id: 'member-1', plexUserId: 'plex-1', jellyfinUserId: null, isAdmin: false }),
    subscription: { status: 'ACTIVE', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' },
    discordConnection: { discordUserId: 'discord-1' },
    ...overrides,
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.user.findUnique.mockResolvedValue(memberRow() as never)
  prismaMock.user.count.mockResolvedValue(2)
  prismaMock.rewindGeneration.count.mockResolvedValue(0)
  prismaMock.$transaction.mockImplementation(((fn: (tx: unknown) => Promise<unknown>) => fn(TX)) as never)
  jest.mocked(isPlexServerOwner).mockResolvedValue(false)
  jest.mocked(loadEraseSubject).mockResolvedValue(SUBJECT)
  jest.mocked(countInventory).mockResolvedValue(COUNTS)
  jest.mocked(cancelStripeSubscription).mockResolvedValue({ success: true, status: 'canceled' })
  jest.mocked(revokeServiceAccess).mockResolvedValue({ success: true, plex: 'removed' })
  jest.mocked(clearDiscordRoleForUser).mockResolvedValue({ linked: true, roleCleared: true, grantRevoked: true })
  jest.mocked(removeMemberJobs).mockResolvedValue(1)
})

const erase = (dryRun = false) => eraseMember('member-1', { actorId: 'admin-1', dryRun })

describe('eraseMember', () => {
  it('blocks the Plex account inside the transaction only when asked', async () => {
    await erase()
    expect(blockPlexAccount).not.toHaveBeenCalled()

    await eraseMember('member-1', { actorId: 'admin-1', dryRun: false, block: true })
    expect(blockPlexAccount).toHaveBeenCalledWith(TX, 'plex-1', 'admin-1')
  })

  it('blocks nothing on a dry run or for a member without a Plex id', async () => {
    await eraseMember('member-1', { actorId: 'admin-1', dryRun: true, block: true })
    prismaMock.user.findUnique.mockResolvedValue(memberRow({ plexUserId: null, jellyfinUserId: 'jf-1' }) as never)
    await eraseMember('member-1', { actorId: 'admin-1', dryRun: false, block: true })
    expect(blockPlexAccount).not.toHaveBeenCalled()
  })

  it('runs every external effect before the one transaction, then audits ids and counts only', async () => {
    const result = await erase()

    expect(result).toEqual({
      success: true,
      data: {
        dryRun: false,
        plan: { cancelStripe: true, services: ['plex'], discordLinked: true },
        counts: COUNTS,
        outcome: {
          stripe: 'canceled',
          access: { plex: 'removed', jellyfin: undefined },
          discord: { linked: true, roleCleared: true, grantRevoked: true },
          jobsRemoved: 1,
        },
      },
    })
    expect(cancelStripeSubscription).toHaveBeenCalledWith('sub_1')
    expect(endUserSessions).toHaveBeenCalledWith('member-1', 'removed', 'admin-1')
    const transactionAt = prismaMock.$transaction.mock.invocationCallOrder[0]
    for (const external of [cancelStripeSubscription, revokeServiceAccess, clearDiscordRoleForUser, endUserSessions, removeMemberJobs]) {
      expect(jest.mocked(external).mock.invocationCallOrder[0]).toBeLessThan(transactionAt)
    }
    expect(deleteInventory).toHaveBeenCalledWith(TX, SUBJECT)
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.MEMBER_ERASED,
      'admin-1',
      expect.objectContaining({ targetUserId: 'member-1', counts: COUNTS, stripeCustomerId: 'cus_1' }),
      TX
    )
    const details = JSON.stringify(jest.mocked(recordAuditEvent).mock.calls[0][2])
    expect(details).not.toContain('@')
  })

  it('makes no external call and writes nothing on a dry run', async () => {
    const result = await erase(true)

    expect(result).toEqual({
      success: true,
      data: { dryRun: true, plan: { cancelStripe: true, services: ['plex'], discordLinked: true }, counts: COUNTS, outcome: null },
    })
    for (const external of [cancelStripeSubscription, revokeServiceAccess, clearDiscordRoleForUser, endUserSessions, removeMemberJobs]) {
      expect(external).not.toHaveBeenCalled()
    }
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it('leaves Stripe alone when the subscription is not billed', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      memberRow({ subscription: { status: 'CANCELED', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' } }) as never
    )

    const result = await erase()

    expect(cancelStripeSubscription).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, data: { outcome: { stripe: 'none' } } })
  })

  it.each([
    ['NOT_FOUND', () => prismaMock.user.findUnique.mockResolvedValue(null)],
    ['OWNER', () => jest.mocked(isPlexServerOwner).mockResolvedValue(true)],
    [
      'LAST_ADMIN',
      () => {
        prismaMock.user.findUnique.mockResolvedValue(memberRow({ isAdmin: true }) as never)
        prismaMock.user.count.mockResolvedValue(1)
      },
    ],
    ['GENERATION_RUNNING', () => prismaMock.rewindGeneration.count.mockResolvedValue(1)],
  ])('refuses with %s, on a dry run too', async (code, setup) => {
    setup()

    await expect(erase(true)).resolves.toMatchObject({ success: false, code })
    await expect(erase()).resolves.toMatchObject({ success: false, code })
    expect(cancelStripeSubscription).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('refuses to remove the caller', async () => {
    await expect(eraseMember('member-1', { actorId: 'member-1', dryRun: false })).resolves.toMatchObject({
      success: false,
      code: 'SELF',
    })
  })

  it('stops before the transaction when Stripe fails', async () => {
    jest.mocked(cancelStripeSubscription).mockResolvedValue({ success: false, code: 'STRIPE_FAILED' })

    await expect(erase()).resolves.toMatchObject({ success: false, code: 'STRIPE_FAILED' })
    expect(revokeServiceAccess).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('stops before the transaction on a Plex failure, and a rerun completes', async () => {
    jest.mocked(revokeServiceAccess).mockResolvedValueOnce({ success: false, code: 'PLEX_UNAVAILABLE' })

    const first = await erase()
    expect(first).toMatchObject({ success: false, code: 'PLEX_UNAVAILABLE', error: expect.stringContaining('Plex') })
    expect(clearDiscordRoleForUser).not.toHaveBeenCalled()
    expect(endUserSessions).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()

    // Stripe already cancelled it; Plex answers now
    jest.mocked(cancelStripeSubscription).mockResolvedValue({ success: true, status: 'already_canceled' })
    const second = await erase()

    expect(second).toMatchObject({ success: true, data: { outcome: { stripe: 'already_canceled', access: { plex: 'removed' } } } })
    expect(deleteInventory).toHaveBeenCalledTimes(1)
    expect(recordAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('skips the Discord unlink for a member without a link', async () => {
    prismaMock.user.findUnique.mockResolvedValue(memberRow({ discordConnection: null }) as never)

    await expect(erase()).resolves.toMatchObject({ success: true, data: { outcome: { discord: null } } })
    expect(clearDiscordRoleForUser).not.toHaveBeenCalled()
  })
})
