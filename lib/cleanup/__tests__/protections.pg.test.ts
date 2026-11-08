/**
 * @jest-environment node
 */

/**
 * Member Keeps and admin exclusions on PostgreSQL (TS 16.3, E6, 13.2). The
 * unique `activeKey` allows one active Keep of a member on a title: a second
 * active one fails, two at the same time leave one, and ended Keeps (with a
 * null key) do not count. The Keep count reads only Keeps that protect now.
 * Member removal through `deleteInventory` deletes the member's Keeps by the
 * `User` cascade and leaves the admin exclusions, which have no member.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. The suite
 * touches only rows it created, keyed by its own run prefix.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { asAppTransactionClient } from "@/__tests__/helpers/prisma-mock"
import {
  countActiveKeeps,
  createExclusion,
  createKeep,
  endKeep,
  expireProtections,
  keepActiveKey,
  type ProtectionTitle,
} from "@/lib/cleanup/protections"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { countInventory, deleteInventory, loadEraseSubject } from "@/lib/members/erase-inventory"
import type { PrismaTransactionClient } from "@/lib/prisma"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `cleanup-prot-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const OTHER = `${RUN}-other`
const ADMIN = `${RUN}-admin`
const DAY = 86_400_000
const now = new Date()

const title = (n: number): ProtectionTitle => ({
  itemKey: `movie:tmdb:${RUN}-${n}`,
  level: "movie",
  titleKey: `tmdb:${RUN}-${n}`,
  title: `Invented Movie ${n}`,
  year: 2019,
  seasonNumber: null,
  sectionId: "1",
  ratingKey: `${n}`,
  externalIds: { tmdb: 900_000 + n },
})

/** Runs `fn` in an interactive transaction, with the client typed as the app's. */
const inTx = <T>(fn: (tx: PrismaTransactionClient) => Promise<T>) => mockDb.$transaction((tx) => fn(asAppTransactionClient(tx)))
/** The client outside a transaction, typed as the app's. */
const db = () => asAppTransactionClient(mockDb)

const keep = (n: number, memberId = MEMBER, at = now, keepDays = 90) =>
  inTx((tx) => createKeep(tx, { title: title(n), memberId, keepDays, restore: null, now: at }))

/** PostgreSQL's unique violation, as Prisma reports it. */
const UNIQUE = { code: "P2002" }

describePg("media cleanup protections on PostgreSQL", (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.createMany({
      data: [
        { id: MEMBER, name: `${RUN} member` },
        { id: OTHER, name: `${RUN} other` },
        { id: ADMIN, name: `${RUN} admin`, isAdmin: true },
      ],
    })
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.cleanupProtection.deleteMany({ where: { itemKey: { startsWith: `movie:tmdb:${RUN}` } } })
    await mockDb.user.deleteMany({ where: { id: { in: [MEMBER, OTHER, ADMIN] } } })
    await mockDb.$disconnect()
  })

  it("refuses a second active Keep of one member on one title", async () => {
    await expect(keep(1)).resolves.toMatchObject({ created: true })

    await expect(keep(1)).resolves.toMatchObject({ created: false })
    const { itemKey, level, titleKey, title: name } = title(1)
    const second = mockDb.cleanupProtection.create({
      data: {
        itemKey,
        level,
        titleKey,
        title: name,
        kind: "memberKeep",
        memberId: MEMBER,
        createdBy: MEMBER,
        expiresAt: new Date(now.getTime() + DAY),
        activeKey: keepActiveKey(itemKey, MEMBER),
      },
    })
    await expect(second).rejects.toMatchObject(UNIQUE)

    // Another member keeps the same title with a key of their own
    await expect(keep(1, OTHER)).resolves.toMatchObject({ created: true })
    expect(await mockDb.cleanupProtection.count({ where: { itemKey: title(1).itemKey, status: "active" } })).toBe(2)
  })

  it("leaves one active Keep when two Keeps of one member on one title run at the same time", async () => {
    const results = await Promise.allSettled([keep(2), keep(2)])

    const created = results.filter((result) => result.status === "fulfilled" && result.value.created)
    expect(created).toHaveLength(1)
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject(UNIQUE)
      else if (!result.value.created) expect(result.value.keep.id).toBe((created[0] as PromiseFulfilledResult<{ keep: { id: string } }>).value.keep.id)
    }
    expect(await mockDb.cleanupProtection.count({ where: { activeKey: keepActiveKey(title(2).itemKey, MEMBER) } })).toBe(1)
  })

  it("allows any number of ended Keeps beside the active one", async () => {
    for (let round = 0; round < 2; round++) {
      const result = await keep(3)
      expect(result.created).toBe(true)
      await expect(inTx((tx) => endKeep(tx, { keepId: result.keep.id, endedBy: "self", endedByUserId: MEMBER, now, memberId: MEMBER }))).resolves.toBe(true)
    }
    await expect(keep(3)).resolves.toMatchObject({ created: true })

    const rows = await mockDb.cleanupProtection.findMany({ where: { itemKey: title(3).itemKey }, orderBy: { createdAt: "asc" } })
    expect(rows.map((row) => [row.status, row.activeKey, row.endedBy])).toEqual([
      ["ended", null, "self"],
      ["ended", null, "self"],
      ["active", keepActiveKey(title(3).itemKey, MEMBER), null],
    ])
  })

  it("ends an expired Keep of the key before it creates the new one", async () => {
    const old = await keep(4, MEMBER, new Date(now.getTime() - 8 * DAY), 7)

    await expect(keep(4)).resolves.toMatchObject({ created: true })

    const ended = await mockDb.cleanupProtection.findUniqueOrThrow({ where: { id: old.keep.id } })
    expect(ended).toMatchObject({ status: "ended", endedBy: "expired", activeKey: null })
  })

  it("counts only the member's Keeps that protect now", async () => {
    const before = await countActiveKeeps(db(), OTHER, now)
    await keep(10, OTHER)
    await keep(11, OTHER)
    // Expired but not ended yet: it no longer protects
    await keep(12, OTHER, new Date(now.getTime() - 10 * DAY), 7)
    const ending = await keep(13, OTHER)
    await endKeep(db(), { keepId: ending.keep.id, endedBy: "admin", endedByUserId: ADMIN, now })

    await expect(countActiveKeeps(db(), OTHER, now)).resolves.toBe(before + 2)
  })

  it("replaces an exclusion of the key, and ends the expired protections", async () => {
    const first = await inTx((tx) => createExclusion(tx, { title: title(20), createdBy: ADMIN, note: "A note", expiresAt: null, now }))
    const second = await inTx((tx) =>
      createExclusion(tx, { title: title(20), createdBy: ADMIN, note: null, expiresAt: new Date(now.getTime() - 1000), now })
    )

    await expect(mockDb.cleanupProtection.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({
      status: "ended",
      endedBy: "admin",
      endedByUserId: ADMIN,
      activeKey: null,
    })
    expect(second).toMatchObject({ status: "active", activeKey: `exclude:${title(20).itemKey}`, memberId: null })

    await expireProtections(now, db())
    await expect(mockDb.cleanupProtection.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({
      status: "ended",
      endedBy: "expired",
      activeKey: null,
    })
  })

  it("deletes the member's Keeps on member removal through deleteInventory, and keeps the admin exclusions", async () => {
    const removed = `${RUN}-removed`
    await mockDb.user.create({ data: { id: removed, name: `${RUN} removed` } })
    await keep(30, removed)
    const ending = await keep(31, removed)
    await endKeep(db(), { keepId: ending.keep.id, endedBy: "self", endedByUserId: removed, now, memberId: removed })
    const exclusion = await inTx((tx) => createExclusion(tx, { title: title(30), createdBy: ADMIN, note: null, expiresAt: null, now }))

    const subject = await loadEraseSubject(removed, null)
    expect((await countInventory(subject)).cleanupProtection).toBe(2)
    await inTx((tx) => deleteInventory(tx, subject))

    expect(await mockDb.user.count({ where: { id: removed } })).toBe(0)
    expect(await mockDb.cleanupProtection.count({ where: { memberId: removed } })).toBe(0)
    await expect(mockDb.cleanupProtection.findUnique({ where: { id: exclusion.id } })).resolves.toMatchObject({ kind: "adminExclude", status: "active" })
  })
})
