/**
 * @jest-environment node
 */

import { Prisma } from '@/lib/generated/prisma/client'
import { isUniqueConflict, isUniqueEmailConflict } from '@/lib/prisma-errors'

function knownError(code: string, meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Request failed', { code, clientVersion: '7.10.1', meta })
}

/** The shape `@prisma/adapter-pg` reports, as captured from PostgreSQL 16 with Prisma 7.10.1. */
function adapterMeta(constraint: Record<string, unknown>) {
  return {
    modelName: 'User',
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint, table: 'User' },
    },
  }
}

describe('isUniqueEmailConflict', () => {
  it.each([
    ['the adapter constraint name', adapterMeta({ index: 'User_email_key' })],
    ['the adapter column list', adapterMeta({ fields: ['email'] })],
    ['the classic target column list', { modelName: 'User', target: ['email'] }],
    ['the classic target constraint name', { modelName: 'User', target: 'User_email_key' }],
  ])('is true for a P2002 on User.email reported by %s', (_label, meta) => {
    expect(isUniqueEmailConflict(knownError('P2002', meta))).toBe(true)
  })

  it.each([
    ['another adapter constraint', adapterMeta({ index: 'User_plexUserId_key' })],
    ['another adapter column', adapterMeta({ fields: ['jellyfinUserId'] })],
    ['another classic target column', { target: ['plexUserId'] }],
    ['another classic target constraint', { target: 'User_plexUserId_key' }],
    ['a meta with neither shape', { modelName: 'User' }],
  ])('is false for a P2002 on %s', (_label, meta) => {
    expect(isUniqueEmailConflict(knownError('P2002', meta))).toBe(false)
  })

  it('is false for another Prisma error code', () => {
    expect(isUniqueEmailConflict(knownError('P2034', adapterMeta({ index: 'User_email_key' })))).toBe(false)
  })

  it('is false for an error that is not a Prisma request error', () => {
    expect(isUniqueEmailConflict(new Error('Unique constraint failed on the fields: (`email`)'))).toBe(false)
    expect(isUniqueEmailConflict({ code: 'P2002', meta: { target: ['email'] } })).toBe(false)
  })
})

describe('isUniqueConflict', () => {
  const invite = { index: 'Invite_code_key', field: 'code' }

  it.each([
    ['the adapter constraint name', adapterMeta({ index: 'Invite_code_key' })],
    ['the adapter column list', adapterMeta({ fields: ['code'] })],
    ['the classic target column list', { target: ['code'] }],
    ['the classic target constraint name', { target: 'Invite_code_key' }],
  ])('is true for a P2002 on the named column reported by %s', (_label, meta) => {
    expect(isUniqueConflict(knownError('P2002', meta), invite)).toBe(true)
  })

  it('is false for another column, another code or another error', () => {
    expect(isUniqueConflict(knownError('P2002', { target: ['joinedUserId'] }), invite)).toBe(false)
    expect(isUniqueConflict(knownError('P2034', { target: ['code'] }), invite)).toBe(false)
    expect(isUniqueConflict(new Error('code'), invite)).toBe(false)
  })
})
