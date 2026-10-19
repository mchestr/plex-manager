/**
 * @jest-environment node
 */

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { adminAction, defineAction, memberAction, publicAction } from '@/lib/actions/define-action'
import { fail, ok } from '@/lib/actions/result'
import { Prisma } from '@/lib/generated/prisma/client'
import { actionClientIp, consume } from '@/lib/security/rate-limit'
import { RATE_LIMITED_MESSAGE } from '@/lib/security/rate-limit-messages'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const session = jest.mocked(getServerSession)
const member = { expires: '2099-01-01', user: { id: 'member-1', isAdmin: false } }
const admin = { expires: '2099-01-01', user: { id: 'admin-1', isAdmin: true } }

beforeEach(() => {
  jest.clearAllMocks()
  session.mockResolvedValue(member)
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(actionClientIp).mockResolvedValue('203.0.113.7')
})

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`code`)', {
    code,
    clientVersion: '7.0.0',
  })
}

describe('auth levels', () => {
  const handler = jest.fn(async () => ok('done'))

  it.each([
    ['member', memberAction({ handler }), null, 'UNAUTHENTICATED'],
    ['admin', adminAction({ handler }), null, 'UNAUTHENTICATED'],
    ['admin', adminAction({ handler }), member, 'FORBIDDEN'],
  ] as const)('a %s action refuses with %s and does not throw', async (_level, action, who, code) => {
    session.mockResolvedValue(who)

    await expect(action()).resolves.toMatchObject({ success: false, code })
    expect(handler).not.toHaveBeenCalled()
  })

  it('a member action refuses a session without a user id', async () => {
    session.mockResolvedValue({ expires: '2099-01-01' } as never)

    await expect(memberAction({ handler })()).resolves.toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
  })

  it('passes the session and user id to member and admin handlers', async () => {
    const seen = jest.fn(async (_input: undefined, ctx: { userId: string }) => ok(ctx.userId))
    session.mockResolvedValue(admin)

    await expect(adminAction({ handler: seen })()).resolves.toEqual({ success: true, data: 'admin-1' })
    expect(seen).toHaveBeenCalledWith(undefined, { session: admin, userId: 'admin-1' })
  })

  it('runs a public action without a session', async () => {
    session.mockResolvedValue(null)

    await expect(publicAction({ handler: async (_i, ctx) => ok(ctx.session) })()).resolves.toEqual({
      success: true,
      data: null,
    })
  })
})

describe('input validation', () => {
  const handler = jest.fn(async ({ name }: { name: string }) => ok(name))
  const rename = memberAction({ input: z.object({ name: z.string().min(1, 'Name is required') }), handler })

  it('returns VALIDATION with fieldErrors and never reaches the handler', async () => {
    const result = await rename({ name: '' })

    expect(result).toEqual({
      success: false,
      code: 'VALIDATION',
      error: 'Name is required',
      fieldErrors: { name: ['Name is required'] },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a wrong shape a caller sends past the types', async () => {
    const result = await rename(JSON.parse('{"name":42}'))

    expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('checks the session before the input', async () => {
    session.mockResolvedValue(null)

    await expect(rename({ name: '' })).resolves.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('hands the parsed value to the handler', async () => {
    const trim = publicAction({ input: z.string().trim(), handler: async (value) => ok(value) })

    await expect(trim('  hi  ')).resolves.toEqual({ success: true, data: 'hi' })
  })
})

describe('rate limits', () => {
  it('returns RATE_LIMITED with retryAfterSec before the handler', async () => {
    jest.mocked(consume).mockResolvedValue({ ok: false, retryAfterSec: 90 })
    const handler = jest.fn(async () => ok(null))

    const result = await memberAction({ rateLimit: { name: 'checkout' }, handler })()

    expect(result).toEqual({ success: false, code: 'RATE_LIMITED', error: RATE_LIMITED_MESSAGE, retryAfterSec: 90 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('keys member actions by user id and public actions by address', async () => {
    await memberAction({ rateLimit: { name: 'checkout' }, handler: async () => ok(null) })()
    expect(consume).toHaveBeenLastCalledWith('checkout', 'member-1')

    await publicAction({ rateLimit: { name: 'invite:validate' }, handler: async () => ok(null) })()
    expect(consume).toHaveBeenLastCalledWith('invite:validate', '203.0.113.7')
  })

  it('spends no point on invalid input', async () => {
    await publicAction({ input: z.string().min(3), rateLimit: { name: 'invite:validate' }, handler: async () => ok(null) })('x')

    expect(consume).not.toHaveBeenCalled()
  })
})

describe('error mapping (SEC-20)', () => {
  it("maps a thrown database error to INTERNAL and never returns its text", async () => {
    const action = memberAction({
      fallbackError: 'Could not save',
      handler: async () => {
        throw new Error("Can't reach database server at db:5432")
      },
    })

    const result = await action()

    expect(result).toEqual({ success: false, code: 'INTERNAL', error: 'Could not save' })
    expect(JSON.stringify(result)).not.toContain('db:5432')
  })

  it('maps Prisma P2002 to CONFLICT and P2025 to NOT_FOUND without the Prisma message', async () => {
    const throwing = (code: string) =>
      memberAction({
        handler: async () => {
          throw prismaError(code)
        },
      })

    const conflict = await throwing('P2002')()
    expect(conflict).toMatchObject({ success: false, code: 'CONFLICT' })
    expect(JSON.stringify(conflict)).not.toContain('Unique constraint')
    await expect(throwing('P2025')()).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
  })

  it('maps a guard failure to INTERNAL instead of throwing', async () => {
    session.mockRejectedValue(new Error('JWT secret mismatch'))

    const result = await memberAction({ handler: async () => ok(null) })()

    expect(result).toMatchObject({ success: false, code: 'INTERNAL' })
    expect(JSON.stringify(result)).not.toContain('JWT')
  })

  it("rethrows Next's redirect so it still navigates", async () => {
    const action = memberAction({
      handler: async () => {
        redirect('/somewhere')
      },
    })

    await expect(action()).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
  })

  it('passes a handler failure through unchanged', async () => {
    const action = defineAction({ auth: 'member', handler: async () => fail('NOT_FOUND', 'No such thing') })

    await expect(action()).resolves.toEqual({ success: false, code: 'NOT_FOUND', error: 'No such thing' })
  })
})

describe('results carry no secrets', () => {
  it.each([
    ['a success', memberAction({ handler: async () => ok({ id: 'x', name: 'Ann' }) })],
    ['a refusal', adminAction({ handler: async () => ok(null) })],
    ['an internal error', memberAction({ handler: async () => Promise.reject(new Error('token=abc')) })],
  ])('%s passes assertNoSecretKeys', async (_label, action) => {
    assertNoSecretKeys(await action())
  })
})
