/**
 * Tests for the DB-backed pending-selection store.
 *
 * A small in-memory array models the `DiscordPendingSelection` table so the
 * gc-on-read behavior (expired rows are swept before every create/find) is
 * exercised for real against a `prisma`-shaped facade.
 */

import {
  createPendingSelection,
  findByCustomId,
  deleteById,
  gcExpired,
  PENDING_SELECTION_TTL_MS,
} from "../pending-store"
import { prisma } from "@/lib/prisma"
import { MarkType } from "@/lib/generated/prisma/client"
import { type PlexMediaItem } from "@/lib/connections/plex"

interface Row {
  id: string
  discordUserId: string
  channelId: string
  customId: string
  markType: MarkType
  results: unknown
  createdAt: Date
  expiresAt: Date
}

let rows: Row[]
let idSeq: number

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordPendingSelection: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}))

const deleteMany = prisma.discordPendingSelection.deleteMany as jest.Mock
const create = prisma.discordPendingSelection.create as jest.Mock
const findUnique = prisma.discordPendingSelection.findUnique as jest.Mock

const item: PlexMediaItem = { ratingKey: "rk-1", title: "The Office", type: "show", year: 2005 }

beforeEach(() => {
  rows = []
  idSeq = 0
  jest.clearAllMocks()

  deleteMany.mockImplementation((args: { where: { id?: string; expiresAt?: { lt: Date } } }) => {
    const before = rows.length
    rows = rows.filter((r) => {
      if (args.where.id !== undefined) return r.id !== args.where.id
      if (args.where.expiresAt?.lt !== undefined) return !(r.expiresAt < args.where.expiresAt.lt)
      return true
    })
    return Promise.resolve({ count: before - rows.length })
  })

  create.mockImplementation((args: { data: Omit<Row, "id" | "createdAt"> & { createdAt?: Date } }) => {
    const row: Row = {
      id: `id-${++idSeq}`,
      createdAt: new Date(),
      ...args.data,
    }
    rows.push(row)
    return Promise.resolve({ ...row })
  })

  findUnique.mockImplementation((args: { where: { customId: string } }) => {
    const row = rows.find((r) => r.customId === args.where.customId)
    return Promise.resolve(row ? { ...row } : null)
  })
})

describe("createPendingSelection", () => {
  it("persists a selection with a default TTL and returns the parsed record", async () => {
    const before = Date.now()
    const record = await createPendingSelection({
      discordUserId: "dU",
      channelId: "chan",
      customId: "cust-1",
      markType: MarkType.FINISHED_WATCHING,
      results: [item],
    })

    expect(record.id).toBe("id-1")
    expect(record.customId).toBe("cust-1")
    expect(record.markType).toBe(MarkType.FINISHED_WATCHING)
    expect(record.results).toEqual([item])
    // Default expiry is ~now + TTL.
    expect(record.expiresAt.getTime()).toBeGreaterThanOrEqual(before + PENDING_SELECTION_TTL_MS - 50)
    expect(rows).toHaveLength(1)
  })

  it("sweeps expired rows before inserting", async () => {
    rows.push({
      id: "old",
      discordUserId: "dU",
      channelId: "chan",
      customId: "expired",
      markType: MarkType.KEEP_FOREVER,
      results: [],
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000), // already expired
    })

    await createPendingSelection({
      discordUserId: "dU",
      channelId: "chan",
      customId: "cust-new",
      markType: MarkType.NOT_INTERESTED,
      results: [item],
    })

    expect(deleteMany).toHaveBeenCalled()
    expect(rows.map((r) => r.customId)).toEqual(["cust-new"])
  })
})

describe("findByCustomId", () => {
  it("returns a live record by custom id", async () => {
    await createPendingSelection({
      discordUserId: "dU",
      channelId: "chan",
      customId: "cust-1",
      markType: MarkType.POOR_QUALITY,
      results: [item],
    })

    const found = await findByCustomId("cust-1")
    expect(found?.customId).toBe("cust-1")
    expect(found?.results).toEqual([item])
  })

  it("returns null for an unknown custom id", async () => {
    expect(await findByCustomId("nope")).toBeNull()
  })

  it("sweeps an expired row on read so it is not returned", async () => {
    rows.push({
      id: "old",
      discordUserId: "dU",
      channelId: "chan",
      customId: "expired",
      markType: MarkType.KEEP_FOREVER,
      results: [],
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
    })

    const found = await findByCustomId("expired")

    expect(found).toBeNull()
    expect(rows).toHaveLength(0) // swept
  })
})

describe("deleteById", () => {
  it("removes a selection by id", async () => {
    const record = await createPendingSelection({
      discordUserId: "dU",
      channelId: "chan",
      customId: "cust-1",
      markType: MarkType.FINISHED_WATCHING,
      results: [item],
    })

    await deleteById(record.id)
    expect(rows).toHaveLength(0)
  })

  it("is a no-op for an unknown id", async () => {
    await expect(deleteById("missing")).resolves.toBeUndefined()
  })
})

describe("gcExpired", () => {
  it("returns the number of rows removed and keeps live rows", async () => {
    rows.push(
      {
        id: "expired",
        discordUserId: "dU",
        channelId: "chan",
        customId: "e",
        markType: MarkType.KEEP_FOREVER,
        results: [],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 1000),
      },
      {
        id: "live",
        discordUserId: "dU",
        channelId: "chan",
        customId: "l",
        markType: MarkType.KEEP_FOREVER,
        results: [],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }
    )

    const removed = await gcExpired()
    expect(removed).toBe(1)
    expect(rows.map((r) => r.id)).toEqual(["live"])
  })
})
