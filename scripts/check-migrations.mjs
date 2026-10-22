#!/usr/bin/env node
/**
 * Migration naming check (plan step P11.6). Runs in CI's `schema-drift` job
 * after `prisma migrate diff`; the rules are in `scripts/migrations/check.mjs`.
 *
 *   node scripts/check-migrations.mjs
 *
 * Create a migration with
 * `npx prisma migrate dev --create-only --name <descriptive_name>` against a
 * `_test` database; never hand-type its timestamp.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkMigrations } from './migrations/check.mjs'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')

const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const { folders: legacy } = JSON.parse(readFileSync(join(MIGRATIONS, '.legacy-names.json'), 'utf8'))

const problems = checkMigrations({
  folders,
  legacy,
  hasSql: (folder) => existsSync(join(MIGRATIONS, folder, 'migration.sql')),
  now: new Date(),
})

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`)
  console.error(
    'check-migrations: create migrations with `npx prisma migrate dev --create-only --name <descriptive_name>` against a _test database.'
  )
  process.exit(1)
}
const checked = folders.filter((folder) => !legacy.includes(folder)).length
console.log(`check-migrations: ${folders.length} migration folders, ${checked} checked, all pass.`)
