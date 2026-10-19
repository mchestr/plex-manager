/**
 * @jest-environment node
 */

/**
 * `memberAction({ entitlement })` (P4.5, SEC-28): `full` needs an entitled
 * member, `read` also lets a lapsed member through, and a refusal is
 * `NOT_ENTITLED` without reaching the handler. The levels come from the real
 * `getAccessLevel` over a mocked database.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { buildConfig } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import type { AccessLevel } from '@/lib/access'
import { memberAction } from '@/lib/actions/define-action'
import { ok } from '@/lib/actions/result'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const handler = jest.fn(async () => ok('done'))
const fullAction = memberAction({ entitlement: 'full', handler })
const readAction = memberAction({ entitlement: 'read', handler })
const anyAction = memberAction({ handler })

/** Database rows for which `getAccessLevel` returns `level` with Stripe on. */
function givenLevel(level: AccessLevel, { isAdmin = false, stripeEnabled = true } = {}) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled }))
  prismaMock.user.findUnique.mockResolvedValue({
    disabledAt: null,
    isAdmin,
    isExempt: false,
    subscription: { status: level === 'full' ? 'ACTIVE' : 'CANCELED' },
  } as never)
  prismaMock.plexWrapped.findFirst.mockResolvedValue(level === 'lapsed' ? ({ id: 'w1' } as never) : null)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ expires: '2099-01-01', user: { id: 'member-1', isAdmin: false } })
})

describe('memberAction entitlement', () => {
  it.each<[string, typeof fullAction, AccessLevel, boolean]>([
    ['full', fullAction, 'full', true],
    ['full', fullAction, 'lapsed', false],
    ['full', fullAction, 'none', false],
    ['read', readAction, 'full', true],
    ['read', readAction, 'lapsed', true],
    ['read', readAction, 'none', false],
  ])('%s against a %s member: allowed %s', async (_required, action, level, allowed) => {
    givenLevel(level)

    const result = await action()

    if (allowed) {
      expect(result).toEqual({ success: true, data: 'done' })
    } else {
      expect(result).toEqual({ success: false, code: 'NOT_ENTITLED', error: 'This needs an active membership.' })
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it('lets an admin through without a subscription', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ expires: '2099-01-01', user: { id: 'admin-1', isAdmin: true } })
    givenLevel('none', { isAdmin: true })

    await expect(fullAction()).resolves.toEqual({ success: true, data: 'done' })
  })

  it.each([fullAction, readAction])('lets everyone through with Stripe off', async (action) => {
    givenLevel('none', { stripeEnabled: false })

    await expect(action()).resolves.toEqual({ success: true, data: 'done' })
  })

  it('reads no level for an action without an entitlement', async () => {
    await expect(anyAction()).resolves.toEqual({ success: true, data: 'done' })
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })

  it('checks the session before the entitlement', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(fullAction()).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
