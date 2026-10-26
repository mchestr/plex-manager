import { hasPermission, parseRole, permissionsFor, PERMISSIONS, ROLES } from '@/lib/permissions'

describe('permissionsFor', () => {
  it('gives an admin every permission', () => {
    expect([...permissionsFor({ isAdmin: true })].sort()).toEqual([...PERMISSIONS].sort())
  })

  it('gives an admin every permission whatever role is stored', () => {
    expect(permissionsFor({ isAdmin: true, role: 'nonsense' }).size).toBe(PERMISSIONS.length)
  })

  it('gives the Support role exactly its listed permissions', () => {
    expect([...permissionsFor({ isAdmin: false, role: 'support' })].sort()).toEqual([...ROLES.support.permissions].sort())
  })

  it('keeps writes and everything beyond the users list out of Support', () => {
    const support = permissionsFor({ isAdmin: false, role: 'support' })

    expect(support.has('assistant:use')).toBe(true)
    expect(support.has('assistant:tools:read')).toBe(true)
    expect(support.has('users:read')).toBe(true)
    expect(support.has('assistant:tools:write')).toBe(false)
  })

  it.each([[null], [undefined], ['member'], ['SUPPORT'], ['']])('gives a non-admin with role %p nothing (fail closed)', (role) => {
    expect(permissionsFor({ isAdmin: false, role }).size).toBe(0)
  })

  it('gives nobody nothing when there is no subject', () => {
    expect(permissionsFor(null).size).toBe(0)
    expect(permissionsFor(undefined).size).toBe(0)
  })
})

describe('hasPermission', () => {
  it('checks one permission', () => {
    expect(hasPermission({ isAdmin: false, role: 'support' }, 'users:read')).toBe(true)
    expect(hasPermission({ isAdmin: false, role: 'support' }, 'assistant:tools:write')).toBe(false)
    expect(hasPermission(null, 'users:read')).toBe(false)
  })
})

describe('parseRole', () => {
  it('returns a known role and null for anything else', () => {
    expect(parseRole('support')).toBe('support')
    expect(parseRole('admin')).toBeNull()
    expect(parseRole(null)).toBeNull()
    expect(parseRole(7)).toBeNull()
  })
})
