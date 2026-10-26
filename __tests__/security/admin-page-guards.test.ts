/**
 * @jest-environment node
 */

/**
 * The admin layout admits a role such as Support (it is not an authorisation
 * boundary), so every admin page must check for itself. A page passes when it
 * calls `assertAdmin()`, `assertPermission()` or `getAdminGate()`; the two
 * pages a role may open are named here with where their check lives.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const ADMIN = join(ROOT, 'app', 'admin')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : pages(path)
    return name === 'page.tsx' ? [path] : []
  })
}

const GUARD = /\b(assertAdmin|assertPermission|getAdminGate)\(/

/** Pages a role may open, with the check that stands in for a guard call. */
const ROLE_PAGES: Record<string, RegExp> = {
  // The loader asserts users:read next to the data, and the page renders read-only for a non-admin
  'app/admin/users/page.tsx': /getAllUsersWithWrapped\(/,
  // Sends everyone but an admin to the users list before reading any tile
  'app/admin/(overview)/page.tsx': /isAdmin\) redirect\(/,
}

const files = pages(ADMIN).map((path) => relative(ROOT, path))

it('finds the admin pages', () => {
  expect(files.length).toBeGreaterThan(15)
})

describe.each(files)('%s', (file) => {
  it('guards itself', () => {
    const source = readFileSync(join(ROOT, file), 'utf8')

    expect(GUARD.test(source) || (ROLE_PAGES[file]?.test(source) ?? false)).toBe(true)
  })
})

it('has the users loader check the permission, not just the layout', () => {
  expect(readFileSync(join(ROOT, 'lib/data/admin-users.ts'), 'utf8')).toContain('assertPermission("users:read")')
})
