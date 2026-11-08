/**
 * @jest-environment node
 */

const mockError = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: (...args: unknown[]) => mockError(...args), warn: jest.fn() }),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupSnapshot } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildShowItem, buildSeasonItem, buildSnapshotFacts, buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import {
  createSnapshotHeader,
  failSnapshot,
  FAILED_MAX_AGE_MS,
  IDLE_MAX_AGE_MS,
  KEPT_COMPLETE,
  loadPreviousCompleteHeader,
  MAX_PART_BYTES,
  pruneIdleSnapshots,
  pruneSnapshots,
  READING_MAX_AGE_MS,
  toHeader,
  writeSnapshot,
} from "@/lib/cleanup/snapshot/store"

const now = new Date("2026-11-08T03:20:00.000Z")
const ago = (ms: number) => new Date(now.getTime() - ms)
const HOUR = 60 * 60_000
const sources = buildSourceStatuses()
const facts = buildSnapshotFacts()
const show = buildShowItem()
const parts = { movie: [buildMovieItem()], show: [show], season: [buildSeasonItem(show, 1), buildSeasonItem(show, 2)] }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.cleanupSnapshot.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.cleanupSnapshot.deleteMany.mockResolvedValue({ count: 0 })
})

describe("toHeader", () => {
  it("parses the sources and the facts of a complete snapshot", () => {
    const row = buildCleanupSnapshot({ sources, facts })
    expect(toHeader(row)).toEqual({
      id: row.id,
      status: "complete",
      trigger: "scheduled",
      actorId: null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      sources,
      facts,
    })
  })

  it("has no facts for a snapshot that is not complete, or whose facts do not parse", () => {
    expect(toHeader(buildCleanupSnapshot({ status: "reading", facts: {} })).facts).toBeNull()
    expect(toHeader(buildCleanupSnapshot({ facts: { version: 2 } })).facts).toBeNull()
  })
})

describe("createSnapshotHeader", () => {
  it("creates a reading header and returns its id", async () => {
    prismaMock.cleanupSnapshot.create.mockResolvedValue(buildCleanupSnapshot({ id: "snap-1" }))

    await expect(createSnapshotHeader({ trigger: "admin", actorId: "admin-1", startedAt: now })).resolves.toBe("snap-1")
    expect(prismaMock.cleanupSnapshot.create).toHaveBeenCalledWith({
      data: { status: "reading", trigger: "admin", actorId: "admin-1", startedAt: now },
      select: { id: true },
    })
  })

  it("has no actor for a scheduled read, and starts now by default", async () => {
    prismaMock.cleanupSnapshot.create.mockResolvedValue(buildCleanupSnapshot({ id: "snap-2" }))
    const before = Date.now()

    await createSnapshotHeader({ trigger: "scheduled" })

    const { data } = prismaMock.cleanupSnapshot.create.mock.calls[0][0]
    expect(data).toMatchObject({ status: "reading", trigger: "scheduled", actorId: null })
    expect((data.startedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })
})

describe("failSnapshot", () => {
  it("marks a reading header failed with its sources", async () => {
    await expect(failSnapshot("snap-1", sources, now)).resolves.toBe(true)
    expect(prismaMock.cleanupSnapshot.updateMany).toHaveBeenCalledWith({
      where: { id: "snap-1", status: "reading" },
      data: { status: "failed", finishedAt: now, sources },
    })
  })

  it("changes no header that is not reading", async () => {
    prismaMock.cleanupSnapshot.updateMany.mockResolvedValue({ count: 0 })
    await expect(failSnapshot("snap-1", [])).resolves.toBe(false)
  })
})

describe("writeSnapshot", () => {
  it("writes the three parts and the complete header in one transaction", async () => {
    prismaMock.cleanupSnapshotPart.createMany.mockReturnValue("parts" as never)
    prismaMock.cleanupSnapshot.update.mockReturnValue("header" as never)

    await expect(writeSnapshot("snap-1", { parts, sources, facts, finishedAt: now })).resolves.toEqual({ ok: true })

    expect(prismaMock.cleanupSnapshotPart.createMany).toHaveBeenCalledWith({
      data: [
        { snapshotId: "snap-1", level: "movie", itemCount: 1, items: parts.movie },
        { snapshotId: "snap-1", level: "show", itemCount: 1, items: parts.show },
        { snapshotId: "snap-1", level: "season", itemCount: 2, items: parts.season },
      ],
    })
    expect(prismaMock.cleanupSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snap-1", status: "reading" },
      data: { status: "complete", finishedAt: now, sources, facts },
    })
    expect(prismaMock.$transaction).toHaveBeenCalledWith(["parts", "header"])
  })

  it("finishes now by default", async () => {
    const before = Date.now()
    await writeSnapshot("snap-1", { parts: { movie: [], show: [], season: [] }, sources, facts })

    const { data } = prismaMock.cleanupSnapshot.update.mock.calls[0][0]
    expect((data.finishedAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  it("fails the read with PART_TOO_LARGE for a part above 20 MB, and writes no part", async () => {
    const huge = buildShowItem({ title: "x".repeat(MAX_PART_BYTES) })

    const result = await writeSnapshot("snap-1", { parts: { ...parts, show: [huge] }, sources, facts, finishedAt: now })

    expect(result).toMatchObject({ ok: false, code: "PART_TOO_LARGE", level: "show" })
    expect(result.ok === false && result.bytes).toBeGreaterThan(MAX_PART_BYTES)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSnapshotPart.createMany).not.toHaveBeenCalled()
    expect(prismaMock.cleanupSnapshot.updateMany).toHaveBeenCalledWith({
      where: { id: "snap-1", status: "reading" },
      data: { status: "failed", finishedAt: now, sources },
    })
    expect(mockError).toHaveBeenCalledWith("cleanup.snapshot_part_too_large", undefined, expect.objectContaining({ snapshotId: "snap-1", level: "show" }))
    expect(MAX_PART_BYTES).toBe(20 * 1024 * 1024)
  })
})

describe("pruneSnapshots", () => {
  it("keeps the 2 newest complete rows and deletes older complete, old reading and old failed rows", async () => {
    const second = ago(24 * HOUR)
    prismaMock.cleanupSnapshot.findMany.mockResolvedValue([
      { id: "newest", finishedAt: ago(HOUR) },
      { id: "second", finishedAt: second },
    ] as never)
    prismaMock.cleanupSnapshot.deleteMany.mockResolvedValue({ count: 4 })

    await expect(pruneSnapshots(now)).resolves.toBe(4)

    expect(prismaMock.cleanupSnapshot.findMany).toHaveBeenCalledWith({
      where: { status: "complete" },
      orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
      take: 2,
      select: { id: true, finishedAt: true },
    })
    expect(prismaMock.cleanupSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: "complete", id: { notIn: ["newest", "second"] }, OR: [{ finishedAt: null }, { finishedAt: { lte: second } }] },
          { status: "reading", startedAt: { lt: ago(HOUR) } },
          { status: "failed", startedAt: { lt: ago(24 * HOUR) } },
        ],
      },
    })
    expect([KEPT_COMPLETE, READING_MAX_AGE_MS, FAILED_MAX_AGE_MS]).toEqual([2, HOUR, 24 * HOUR])
  })

  it("deletes no complete row while fewer than 2 exist", async () => {
    prismaMock.cleanupSnapshot.findMany.mockResolvedValue([{ id: "only", finishedAt: ago(HOUR) }] as never)

    await pruneSnapshots(now)

    expect(prismaMock.cleanupSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: "reading", startedAt: { lt: ago(HOUR) } },
          { status: "failed", startedAt: { lt: ago(24 * HOUR) } },
        ],
      },
    })
  })

  it("prunes at the current time by default", async () => {
    prismaMock.cleanupSnapshot.findMany.mockResolvedValue([])
    const before = Date.now()

    await pruneSnapshots()

    const [{ where }] = prismaMock.cleanupSnapshot.deleteMany.mock.calls[0] as [{ where: { OR: { startedAt: { lt: Date } }[] } }]
    expect(where.OR[0].startedAt.lt.getTime()).toBeGreaterThanOrEqual(before - HOUR)
  })
})

describe("pruneIdleSnapshots", () => {
  it("deletes every snapshot that finished, or started without finishing, over 48 hours ago", async () => {
    prismaMock.cleanupSnapshot.deleteMany.mockResolvedValue({ count: 2 })
    const cutoff = ago(48 * HOUR)

    await expect(pruneIdleSnapshots(now)).resolves.toBe(2)
    expect(prismaMock.cleanupSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ finishedAt: { lt: cutoff } }, { finishedAt: null, startedAt: { lt: cutoff } }] },
    })
    expect(IDLE_MAX_AGE_MS).toBe(48 * HOUR)
  })

  it("prunes at the current time by default", async () => {
    await expect(pruneIdleSnapshots()).resolves.toBe(0)
  })
})

describe("loadPreviousCompleteHeader", () => {
  it("reads the newest complete header", async () => {
    const row = buildCleanupSnapshot({ id: "prev", facts })
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(row)

    await expect(loadPreviousCompleteHeader()).resolves.toMatchObject({ id: "prev", facts })
    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledWith({
      where: { status: "complete" },
      orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
    })
  })

  it("leaves out the snapshot it is given", async () => {
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(null)

    await expect(loadPreviousCompleteHeader("current")).resolves.toBeNull()
    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledWith({
      where: { status: "complete", id: { not: "current" } },
      orderBy: { finishedAt: { sort: "desc", nulls: "last" } },
    })
  })
})
