/**
 * @jest-environment node
 *
 * The `@example` blocks of lib/actions.
 */

import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { memberAction } from '@/lib/actions/define-action'
import { ok, toActionError } from '@/lib/actions/result'
import { parseRouteParams } from '@/lib/actions/route'
import { ratingKeySchema } from '@/lib/validations/params'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/security/rate-limit', () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

describe('JSDoc Documentation Examples', () => {
  it('defineAction: a member action with an input schema', async () => {
    jest.mocked(getServerSession).mockResolvedValue({ expires: '2099-01-01', user: { id: 'u1', isAdmin: false } })
    const update = jest.fn()
    const renameThing = memberAction({
      input: z.object({ name: z.string().min(1).max(80) }),
      handler: async ({ name }, { userId }) => {
        update({ where: { userId }, data: { name } })
        return ok(null)
      },
    })

    await expect(renameThing({ name: 'Den' })).resolves.toEqual({ success: true, data: null })
    expect(update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { name: 'Den' } })
  })

  it('toActionError never returns the message', () => {
    expect(toActionError(new Error("Can't reach database server at db:5432"), 'Failed to save')).toEqual({
      success: false,
      code: 'INTERNAL',
      error: 'Failed to save',
    })
  })

  it('parseRouteParams returns the parsed params', () => {
    const params = parseRouteParams(z.object({ ratingKey: ratingKeySchema }), { ratingKey: '123' })
    expect(params.ok && params.data.ratingKey).toBe('123')
  })
})
