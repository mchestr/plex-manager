/**
 * @jest-environment node
 */

/**
 * The keyset-paged activity timeline on PostgreSQL (P10.6, GAP-38): 47
 * interleaved events, four of them sharing timestamps across the two sources
 * and two sharing one within a source, walked ten at a time.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only its own user's rows.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { getUserActivityTimeline } from '@/actions/user-queries'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { id: 'admin', isAdmin: true } }) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

const USER = `p106-${randomUUID()}`
const BASE = Date.parse('2026-10-12T19:26:00Z')

type Source = 'discord_command' | 'media_mark'
interface Seeded {
  source: Source
  id: string
  ts: Date
}

/** Event i is a Discord command when even; minutes 10, 20 and 40 are shared. */
function events(): Seeded[] {
  const minuteOf = (i: number) => (i === 11 ? 10 : i === 21 ? 20 : i === 42 ? 40 : i)
  return Array.from({ length: 47 }, (_, i) => {
    const source: Source = i % 2 === 0 ? 'discord_command' : 'media_mark'
    const id = `${source === 'discord_command' ? 'd' : 'm'}${String(i).padStart(3, '0')}${USER.slice(5, 13)}`
    return { source, id, ts: new Date(BASE - minuteOf(i) * 60_000) }
  })
}

function referenceOrder(rows: Seeded[]): string[] {
  return [...rows]
    .sort((a, b) => {
      const byTime = b.ts.getTime() - a.ts.getTime()
      if (byTime !== 0) return byTime
      if (a.source !== b.source) return a.source < b.source ? -1 : 1
      return a.id < b.id ? 1 : -1
    })
    .map((row) => row.id)
}

async function page(cursor?: string) {
  const result = await getUserActivityTimeline({ userId: USER, cursor, pageSize: 10 })
  if (!result.success) throw new Error(result.error)
  return result.data
}

describePg('activity timeline keyset paging', (databaseUrl) => {
  const seeded = events()
  const reference = referenceOrder(seeded)

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.create({ data: { id: USER } })
    for (const row of seeded) {
      if (row.source === 'discord_command') {
        await mockDb.discordCommandLog.create({
          data: { id: row.id, userId: USER, discordUserId: 'discord-1', commandType: 'CHAT', commandName: '!assistant', channelId: 'c1', channelType: 'dm', createdAt: row.ts },
        })
      } else {
        await mockDb.userMediaMark.create({
          data: { id: row.id, userId: USER, mediaType: 'MOVIE', plexRatingKey: row.id, title: row.id, markType: 'FINISHED_WATCHING', markedVia: 'web', markedAt: row.ts },
        })
      }
    }
  })

  afterAll(async () => {
    await mockDb.discordCommandLog.deleteMany({ where: { userId: USER } })
    await mockDb.user.deleteMany({ where: { id: USER } })
    await mockDb.$disconnect()
  })

  it('walks five pages in the reference order with no duplicates or gaps', async () => {
    const pages = []
    let cursor: string | undefined
    for (let i = 0; i < 5; i++) {
      const data = await page(cursor)
      pages.push(data)
      cursor = data.nextCursor ?? undefined
    }

    expect(pages.map((p) => p.items.length)).toEqual([10, 10, 10, 10, 7])
    expect(pages.every((p) => p.total === 47)).toBe(true)
    expect(pages[2].items.map((item) => item.id)).toEqual(reference.slice(20, 30))
    expect(pages[4].items.map((item) => item.id)).toEqual(reference.slice(40, 47))

    const all = pages.flatMap((p) => p.items.map((item) => item.id))
    expect(new Set(all).size).toBe(47)
    expect(all).toEqual(reference)
    expect(pages[4].nextCursor).toBeNull()
  })

  it('refuses a malformed cursor', async () => {
    const bad = await getUserActivityTimeline({ userId: USER, cursor: 'not-a-cursor', pageSize: 10 })
    expect(bad).toMatchObject({ success: false, code: 'VALIDATION' })

    const forged = Buffer.from(JSON.stringify({ ts: 'yesterday', source: 'media_mark', id: 'x' })).toString('base64url')
    expect(await getUserActivityTimeline({ userId: USER, cursor: forged })).toMatchObject({ success: false, code: 'VALIDATION' })
  })
})
