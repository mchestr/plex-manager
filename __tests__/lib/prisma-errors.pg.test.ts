/**
 * @jest-environment node
 */

/**
 * `isUniqueEmailConflict` against the error a real PostgreSQL raises through
 * the pg driver adapter. The P2002 shape it reads is undocumented, so this
 * catches a Prisma or adapter upgrade that moves it (the Plex sign-in and
 * invite retries would otherwise stop firing without notice).
 *
 * Gated by `describePg` (test/helpers/integration.ts) and run only by
 * `npm run test:integration`. The database needs the app's migrations applied. The
 * suite only touches `User` rows whose id starts with its own run prefix.
 *
 *   TEST_DATABASE_URL=postgresql://.../plex_manager_test npm run test:integration
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import { isUniqueEmailConflict } from '@/lib/prisma-errors'
import { describePg } from '@/test/helpers/integration'

const RUN = `p05-${randomUUID()}`

/** Runs `write` and returns what it threw. */
async function thrownBy(write: () => Promise<unknown>): Promise<unknown> {
  try {
    await write()
  } catch (error) {
    return error
  }
  throw new Error('Expected the write to fail')
}

describePg('isUniqueEmailConflict on PostgreSQL', (databaseUrl) => {
  let db: PrismaClient

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await db.user.create({
      data: { id: `${RUN}-holder`, email: `${RUN}@example.com`, plexUserId: `${RUN}-plex` },
    })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { startsWith: RUN } } })
    await db.$disconnect()
  })

  it('is true for a duplicate email', async () => {
    const error = await thrownBy(() =>
      db.user.create({ data: { id: `${RUN}-email`, email: `${RUN}@example.com` } })
    )

    expect(isUniqueEmailConflict(error)).toBe(true)
  })

  it('is true for an update that moves a row onto a taken email', async () => {
    await db.user.create({ data: { id: `${RUN}-other`, email: `${RUN}-other@example.com` } })

    const error = await thrownBy(() =>
      db.user.update({ where: { id: `${RUN}-other` }, data: { email: `${RUN}@example.com` } })
    )

    expect(isUniqueEmailConflict(error)).toBe(true)
  })

  it('is false for a duplicate on another unique column', async () => {
    const error = await thrownBy(() =>
      db.user.create({ data: { id: `${RUN}-plex`, plexUserId: `${RUN}-plex` } })
    )

    expect(isUniqueEmailConflict(error)).toBe(false)
  })
})
