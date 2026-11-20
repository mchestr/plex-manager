/**
 * @jest-environment node
 */

/**
 * The snapshot store on PostgreSQL (TS 2.7, 7.1, 16.3). A library read
 * writes its three parts and the complete header in one transaction: a
 * header that is no longer `reading` makes the write fail, and then no part
 * exists. Prune keeps the 2 newest complete snapshots and a young `reading`
 * row, and deletes older complete rows, a `reading` row older than 1 hour and
 * a `failed` row older than 1 day, with their parts. The idle path deletes
 * every snapshot older than 48 hours.
 *
 * Prune works on the whole table, so each case starts from an empty
 * `CleanupSnapshot` table. That is safe: the integration suites run one at a
 * time on their own test database. Gated by `describePg` and run only by
 * `npm run test:integration`.
 */

import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { buildMovieItem, buildSeasonItem, buildShowItem, buildSnapshotFacts, buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  createSnapshotHeader,
  failSnapshot,
  loadPreviousCompleteHeader,
  pruneIdleSnapshots,
  pruneSnapshots,
  writeSnapshot,
} from "@/lib/cleanup/snapshot/store"
import { PrismaClient } from "@/lib/generated/prisma/client"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const HOUR = 60 * 60_000
const now = new Date()
const ago = (ms: number) => new Date(now.getTime() - ms)
const sources = buildSourceStatuses()
const facts = buildSnapshotFacts()
const show = buildShowItem()
const parts = { movie: [buildMovieItem()], show: [show], season: [buildSeasonItem(show, 1), buildSeasonItem(show, 2)] }

/** A complete snapshot that finished at `finishedAt`, with its three parts. */
async function complete(finishedAt: Date): Promise<string> {
  const id = await createSnapshotHeader({ trigger: "scheduled", startedAt: new Date(finishedAt.getTime() - 10 * 60_000) })
  await expect(writeSnapshot(id, { parts, sources, facts, finishedAt })).resolves.toEqual({ ok: true })
  return id
}

/** A header left in `status`, started at `startedAt`. */
async function header(status: "reading" | "failed", startedAt: Date): Promise<string> {
  const id = await createSnapshotHeader({ trigger: "admin", actorId: "admin-1", startedAt })
  if (status === "failed") await failSnapshot(id, sources, new Date(startedAt.getTime() + 60_000))
  return id
}

const ids = async () => (await mockDb.cleanupSnapshot.findMany({ select: { id: true } })).map((row) => row.id).sort()

describePg("media cleanup snapshot store on PostgreSQL", (databaseUrl) => {
  beforeAll(() => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  beforeEach(async () => {
    await mockDb.cleanupSnapshot.deleteMany({})
  })

  afterAll(async () => {
    if (!mockDb) return
    await mockDb.cleanupSnapshot.deleteMany({})
    await mockDb.$disconnect()
  })

  it("writes the three parts and the complete header in one transaction", async () => {
    const id = await createSnapshotHeader({ trigger: "admin", actorId: "admin-1" })
    await expect(mockDb.cleanupSnapshot.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ status: "reading", finishedAt: null })

    const finishedAt = new Date()
    await expect(writeSnapshot(id, { parts, sources, facts, finishedAt })).resolves.toEqual({ ok: true })

    const row = await mockDb.cleanupSnapshot.findUniqueOrThrow({ where: { id }, include: { parts: { orderBy: { level: "asc" } } } })
    expect(row).toMatchObject({ status: "complete", finishedAt, sources, facts })
    expect(row.parts.map((part) => [part.level, part.itemCount])).toEqual([
      ["movie", 1],
      ["season", 2],
      ["show", 1],
    ])
    expect(row.parts.find((part) => part.level === "season")?.items).toEqual(parts.season)
    await expect(loadPreviousCompleteHeader()).resolves.toMatchObject({ id, facts, sources })
    await expect(loadPreviousCompleteHeader(id)).resolves.toBeNull()
  })

  it("writes no part when the header is no longer reading", async () => {
    const id = await header("failed", now)

    await expect(writeSnapshot(id, { parts, sources, facts })).rejects.toThrow()

    expect(await mockDb.cleanupSnapshotPart.count({ where: { snapshotId: id } })).toBe(0)
    await expect(mockDb.cleanupSnapshot.findUniqueOrThrow({ where: { id } })).resolves.toMatchObject({ status: "failed" })
  })

  it("keeps no part of a write whose parts fail, and leaves the header reading", async () => {
    const id = await createSnapshotHeader({ trigger: "system" })
    await mockDb.cleanupSnapshotPart.create({ data: { snapshotId: id, level: "season", itemCount: 0, items: [] } })

    await expect(writeSnapshot(id, { parts, sources, facts })).rejects.toThrow()

    const row = await mockDb.cleanupSnapshot.findUniqueOrThrow({ where: { id }, include: { parts: true } })
    expect(row.status).toBe("reading")
    expect(row.parts.map((part) => part.level)).toEqual(["season"])
  })

  it("keeps the 2 newest complete snapshots and a young reading row, and deletes the rest with their parts", async () => {
    const oldest = await complete(ago(72 * HOUR))
    const older = await complete(ago(48 * HOUR))
    const second = await complete(ago(24 * HOUR))
    const newest = await complete(ago(HOUR))
    await header("reading", ago(HOUR + 60_000))
    const youngReading = await header("reading", ago(30 * 60_000))
    await header("failed", ago(25 * HOUR))
    const youngFailed = await header("failed", ago(2 * HOUR))

    await expect(pruneSnapshots(now)).resolves.toBe(4)

    expect(await ids()).toEqual([newest, second, youngReading, youngFailed].sort())
    expect(await mockDb.cleanupSnapshotPart.count({ where: { snapshotId: { in: [oldest, older] } } })).toBe(0)
    expect(await mockDb.cleanupSnapshotPart.count({ where: { snapshotId: { in: [newest, second] } } })).toBe(6)
  })

  it("deletes no complete snapshot while fewer than 3 exist", async () => {
    const first = await complete(ago(30 * 24 * HOUR))
    const last = await complete(ago(HOUR))

    await expect(pruneSnapshots(now)).resolves.toBe(0)
    expect(await ids()).toEqual([first, last].sort())
  })

  it("deletes every snapshot older than 48 hours on the idle path", async () => {
    const old = await complete(ago(49 * HOUR))
    const recent = await complete(ago(47 * HOUR))
    const oldReading = await header("reading", ago(50 * HOUR))

    await expect(pruneIdleSnapshots(now)).resolves.toBe(2)

    expect(await ids()).toEqual([recent])
    expect(await mockDb.cleanupSnapshotPart.count({ where: { snapshotId: { in: [old, oldReading] } } })).toBe(0)
  })
})
