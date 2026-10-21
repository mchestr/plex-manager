/**
 * @jest-environment node
 */

/**
 * Roll back (P7.9, design 7.9): the previous data comes back and the current
 * data is kept for undo, so a second roll back restores it; refused while a
 * run is active, without `previousData`, and when that data does not parse;
 * admins only; one audit entry, written in the same transaction.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getRewindRollbackTarget, rollbackRewind } from "@/actions/admin/rewind-season"
import type { RewindGeneration } from "@/lib/generated/prisma/client"
import { acquireGenerationLock } from "@/lib/queue/redis-lock"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { hasActiveGeneration } from "@/lib/rewind/generation-guards"
import { AuditEventType } from "@/lib/security/audit-log"
import { minimalV3 } from "@/lib/wrapped/data/__tests__/v3-row"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/queue/rewind-infra", () => ({ checkRewindInfra: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn(() => ({})) }))
jest.mock("@/lib/queue/redis-lock", () => ({ acquireGenerationLock: jest.fn() }))
jest.mock("@/lib/rewind/generation-guards", () => ({ hasActiveGeneration: jest.fn() }))
// The season-run producers reach BullMQ, which this suite never needs.
jest.mock("@/lib/rewind/season-runs", () => ({}))
jest.mock("@/lib/wrapped/admin/season", () => ({}))
jest.mock("@/lib/wrapped/admin/season-estimate", () => ({}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const YEAR = 2026
const MEMBER = "member-1"

const issue = (factsHash: string, generatedAt: string) => JSON.stringify({ ...minimalV3(), factsHash, generatedAt })
const OLD = issue("a".repeat(64), "2026-11-20T10:00:00.000Z")
const NEW = issue("b".repeat(64), "2026-11-22T10:00:00.000Z")

/** An in-memory member: one PlexWrapped row and its generations, newest last. */
let wrapped: { id: string; status: string; data: string; factsHash: string | null; edition: string | null }
let generations: Array<Pick<RewindGeneration, "id" | "wrappedId" | "status" | "previousData" | "kind" | "finishedAt" | "factsHash">>
const release = jest.fn(async () => true)

function seed(previousData: string | null) {
  wrapped = { id: "wrapped-1", status: "completed", data: NEW, factsHash: "b".repeat(64), edition: "full" }
  generations = [
    { id: "gen-1", wrappedId: "wrapped-1", status: "completed", previousData, kind: "season", finishedAt: new Date("2026-11-22T10:00:00Z"), factsHash: "b".repeat(64) },
  ]
}

function wireDatabase() {
  prismaMock.rewindGeneration.findFirst.mockImplementation((async () => {
    const withPrevious = generations.filter((g) => g.status === "completed" && g.previousData !== null)
    return withPrevious.at(-1) ?? null
  }) as never)
  prismaMock.plexWrapped.findUniqueOrThrow.mockImplementation((async () => ({ status: wrapped.status, data: wrapped.data })) as never)
  prismaMock.plexWrapped.update.mockImplementation((async ({ data }: { data: Partial<typeof wrapped> }) => {
    wrapped = { ...wrapped, ...data }
    return wrapped
  }) as never)
  prismaMock.rewindGeneration.create.mockImplementation((async ({ data }: { data: (typeof generations)[number] }) => {
    const created = { ...data, id: `gen-${generations.length + 1}` }
    generations.push(created)
    return { id: created.id }
  }) as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
}

function signIn(isAdmin: boolean) {
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: isAdmin ? "admin-1" : MEMBER, isAdmin } })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  signIn(true)
  seed(OLD)
  wireDatabase()
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(hasActiveGeneration).mockResolvedValue(false)
  jest.mocked(acquireGenerationLock).mockResolvedValue({ release })
})

it("restores the previous data and keeps the current data for undo", async () => {
  const result = await rollbackRewind({ userId: MEMBER, year: YEAR })

  expect(result).toEqual({ success: true, data: { generationId: "gen-2" } })
  expect(wrapped).toMatchObject({ data: OLD, status: "completed", factsHash: "a".repeat(64), edition: "postcard" })
  expect(prismaMock.plexWrapped.update).toHaveBeenCalledWith({
    where: { id: "wrapped-1" },
    data: expect.objectContaining({ dataVersion: 3, dataThrough: new Date("2026-11-30T00:00:00.000Z"), generatedAt: new Date("2026-11-20T10:00:00.000Z") }),
  })
  expect(generations[1]).toMatchObject({ kind: "admin", status: "completed", previousData: NEW })
  expect(release).toHaveBeenCalledTimes(1)
})

it("undoes itself: a second roll back restores the version the first replaced", async () => {
  await rollbackRewind({ userId: MEMBER, year: YEAR })
  await rollbackRewind({ userId: MEMBER, year: YEAR })

  expect(wrapped.data).toBe(NEW)
  expect(generations.map((g) => g.previousData)).toEqual([OLD, NEW, OLD])
})

it("writes one REWIND_ROLLED_BACK entry inside the transaction", async () => {
  await rollbackRewind({ userId: MEMBER, year: YEAR })

  expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
  expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: AuditEventType.REWIND_ROLLED_BACK,
      actorUserId: "admin-1",
      targetUserId: MEMBER,
      details: expect.objectContaining({ year: YEAR, sourceGenerationId: "gen-1", generationId: "gen-2" }),
    }),
  })
})

it("is refused while a run is queued or running, before and under the lock", async () => {
  jest.mocked(hasActiveGeneration).mockResolvedValueOnce(true)
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "CONFLICT" })
  expect(acquireGenerationLock).not.toHaveBeenCalled()

  jest.mocked(hasActiveGeneration).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "CONFLICT" })
  expect(release).toHaveBeenCalledTimes(1)

  jest.mocked(acquireGenerationLock).mockResolvedValueOnce(null)
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "CONFLICT" })

  expect(prismaMock.$transaction).not.toHaveBeenCalled()
  expect(wrapped.data).toBe(NEW)
})

it("is refused without previousData", async () => {
  seed(null)
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "NOT_FOUND" })
  expect(await getRewindRollbackTarget({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "NOT_FOUND" })
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
})

it("is refused when the previous data does not parse", async () => {
  seed(JSON.stringify({ version: 3, year: YEAR }))
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "CONFLICT" })
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
  expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
})

it("refuses non-admins before reading anything", async () => {
  signIn(false)
  expect(await rollbackRewind({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "FORBIDDEN" })
  expect(await getRewindRollbackTarget({ userId: MEMBER, year: YEAR })).toMatchObject({ success: false, code: "FORBIDDEN" })
  expect(prismaMock.rewindGeneration.findFirst).not.toHaveBeenCalled()
})

it("names the date of the version it would restore", async () => {
  expect(await getRewindRollbackTarget({ userId: MEMBER, year: YEAR })).toEqual({ success: true, data: { from: "2026-11-20T10:00:00.000Z" } })
})
