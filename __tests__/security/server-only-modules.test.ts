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
  'lib/cleanup/snapshot/read.ts',
  'lib/cleanup/snapshot/access.ts',
  // The collection sync: plan.ts and text.ts are pure
  'lib/cleanup/collections/adopt.ts',
  'lib/cleanup/collections/collection.ts',
  'lib/cleanup/collections/context.ts',
  'lib/cleanup/collections/read-members.ts',
  'lib/cleanup/collections/request.ts',
  'lib/cleanup/collections/sync.ts',
  // The preview: the pure parts (compute, results, words, why text) stay client-safe
  'lib/cleanup/preview/load.ts',
  'lib/cleanup/preview/protection-impact.ts',
  'lib/cleanup/preview/recipe-preview.ts',
  'lib/cleanup/preview/rules.ts',
  'lib/cleanup/preview/run-preview.ts',
  'lib/cleanup/preview/why-load.ts',
  'lib/cleanup/preview/why-sheet.ts',
  // Member data: label-filter.ts, reasons.ts and groups.ts are pure
  'lib/cleanup/member/access.ts',
  'lib/cleanup/member/gate.ts',
  'lib/cleanup/member/items.ts',
  'lib/cleanup/member/keeps.ts',
  'lib/cleanup/member/list.ts',
  // The screen loaders' helpers that read the database, plex.tv or member names; the other screens files are pure
  'lib/cleanup/screens/history/titles.ts',
  'lib/cleanup/screens/history/words.ts',
  'lib/cleanup/screens/leaving/batch-data.ts',
  'lib/cleanup/screens/leaving/list.ts',
  'lib/cleanup/screens/leaving/people.ts',
  'lib/cleanup/screens/leaving/words.ts',
  'lib/cleanup/screens/overview/context.ts',
  'lib/cleanup/screens/overview/read.ts',
  'lib/cleanup/screens/overview/rule-cards.ts',
  'lib/cleanup/screens/protections/tiles.ts',
  'lib/cleanup/screens/settings/feature.ts',
  'lib/cleanup/screens/settings/protections.ts',
  'lib/cleanup/screens/turn-on/assemble.ts',
  'lib/cleanup/screens/turn-on/who-sees.ts',
]

/** The action steps' words, focus helper and pure option merge, which the dialogs and the tests import. */
const CLEANUP_ACTIONS_CLIENT_SAFE = new Set([
  'lib/cleanup/actions/items/dialog-focus.ts',
  'lib/cleanup/actions/items/words.ts',
  'lib/cleanup/actions/keeps/words.ts',
  'lib/cleanup/actions/settings/options.ts',
  'lib/cleanup/actions/settings/words.ts',
])

const MODULES = [
  ...filesIn('lib/data'),
  'lib/admin.ts',
  'lib/guards.ts',
  'lib/access.ts',
  'lib/setup/status.ts',
  ...filesIn('lib/chatbot', true).filter((path) => !TYPE_ONLY.has(path)),
  ...filesIn('lib/affiliates').filter((path) => !AFFILIATE_CLIENT_SAFE.has(path)),
  ...CLEANUP_SERVER_ONLY,
  // The run: each file reads or writes the item rows, or calls the arr services
  ...filesIn('lib/cleanup/run'),
  // The action steps write the cleanup rows
  ...filesIn('lib/cleanup/actions', true).filter((path) => !CLEANUP_ACTIONS_CLIENT_SAFE.has(path)),
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
      'lib/cleanup/snapshot/read.ts',
      'lib/cleanup/collections/sync.ts',
      'lib/cleanup/preview/run-preview.ts',
      'lib/cleanup/member/gate.ts',
      'lib/cleanup/run/reconcile.ts',
      'lib/cleanup/run/delete.ts',
      'lib/cleanup/run/delete-actions.ts',
      'lib/cleanup/actions/items/approve.ts',
      'lib/cleanup/screens/settings/feature.ts',
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
