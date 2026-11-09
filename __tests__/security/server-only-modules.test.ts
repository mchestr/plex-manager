/**
 * The server-only boundaries (P11.5, BP-06): admin loaders, the guards and
 * the chatbot internals import `server-only` and are not `'use server'`
 * files, so none of their exports is callable as a Server Action.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

const filesIn = (dir: string, recursive = false): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true, recursive }).flatMap((entry) => {
    const path = join(entry.parentPath, entry.name)
    if (!entry.isFile() || !/\.ts$/.test(entry.name) || path.includes('__tests__')) return []
    return [path.slice(ROOT.length + 1)]
  })

/** The chatbot's type-only modules hold no code to protect. */
const TYPE_ONLY = new Set(['lib/chatbot/types.ts', 'lib/chatbot/tools/types.ts'])

/** Pure affiliate modules with no database read, which client components and the proxy may import. */
const AFFILIATE_CLIENT_SAFE = new Set([
  'lib/affiliates/allowance.ts',
  'lib/affiliates/copy.ts',
  'lib/affiliates/flags.ts',
  'lib/affiliates/standing.ts',
  'lib/affiliates/switch-state.ts',
  'lib/affiliates/tiers.ts',
])

/** Media cleanup modules that read the database, Redis or member ids. The pure engine and snapshot files stay client-safe. */
const CLEANUP_SERVER_ONLY = [
  'lib/cleanup/settings.ts',
  'lib/cleanup/claims.ts',
  'lib/cleanup/live-facts.ts',
  'lib/cleanup/protections.ts',
  'lib/cleanup/schedule.ts',
  'lib/cleanup/snapshot/store.ts',
  'lib/cleanup/snapshot/cache.ts',
]

const MODULES = [
  ...filesIn('lib/data'),
  'lib/admin.ts',
  'lib/guards.ts',
  'lib/access.ts',
  'lib/setup/status.ts',
  ...filesIn('lib/chatbot', true).filter((path) => !TYPE_ONLY.has(path)),
  ...filesIn('lib/affiliates').filter((path) => !AFFILIATE_CLIENT_SAFE.has(path)),
  ...CLEANUP_SERVER_ONLY,
  // The mail code reads the environment or the database; env-rules is pure, but only server code needs it
  ...filesIn('lib/email', true),
].sort()

it('covers the loaders, the chatbot, the affiliate and the media cleanup modules', () => {
  expect(MODULES).toEqual(
    expect.arrayContaining([
      'lib/data/discord-activity.ts',
      'lib/data/admin-users.ts',
      'lib/chatbot/executors/sonarr.ts',
      'lib/affiliates/settings.ts',
      'lib/cleanup/protections.ts',
      'lib/cleanup/snapshot/cache.ts',
      'lib/email/transport.ts',
    ])
  )
})

it.each(MODULES)('%s imports server-only and is not a use server file', (path) => {
  const source = readFileSync(join(ROOT, path), 'utf8')

  expect(source).toMatch(/^import ["']server-only["']/m)
  expect(source).not.toMatch(/^\s*["']use server["']/m)
})

it('keeps chatWithAdminBot as the only module left in actions/chatbot', () => {
  expect(filesIn('actions/chatbot', true)).toEqual(['actions/chatbot/index.ts'])
})
