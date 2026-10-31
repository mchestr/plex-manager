/**
 * @jest-environment node
 */

const mockWarn = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args) }),
}))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/connections/tautulli-last-seen", () => ({ listTautulliLastSeen: jest.fn(), getOldestPlay: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getOldestPlay, listTautulliLastSeen, type TautulliLastSeen } from "@/lib/connections/tautulli-last-seen"
import { getActiveService } from "@/lib/data/active-service"
import { SYNC_CHUNK, syncLastSeen } from "@/lib/inactivity/sync"

const now = new Date("2026-10-31T02:17:00.000Z")
const tautulli = { id: "t1", url: "http://tautulli.local:8181", apiKey: "k" }
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const historyStart = day("2024-02-01")

function read(rows: TautulliLastSeen["rows"], dropped = 0) {
  jest.mocked(listTautulliLastSeen).mockResolvedValue({ ok: true, data: { rows, dropped } })
}

function members(rows: { id: string; plexUserId: string; lastSeenAt: Date | null }[]) {
  prismaMock.user.findMany.mockResolvedValue(rows as never)
}

/** The data each member update wrote, by member id. */
function written() {
  return Object.fromEntries(prismaMock.user.updateMany.mock.calls.map(([args]) => [args?.where?.id, args?.data]))
}

beforeEach(() => {
  mockReset(prismaMock)
  mockWarn.mockReset()
  jest.mocked(getActiveService).mockResolvedValue(tautulli as never)
  jest.mocked(getOldestPlay).mockReset().mockResolvedValue({ ok: true, data: historyStart })
  read([])
  members([])
})

describe("syncLastSeen", () => {
  it("reports a server without Tautulli and reads nothing", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)

    await expect(syncLastSeen({ now })).resolves.toEqual({ ok: false, code: "NO_TAUTULLI" })
    expect(listTautulliLastSeen).not.toHaveBeenCalled()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it("passes a failed read on and writes nothing", async () => {
    jest.mocked(listTautulliLastSeen).mockResolvedValue({ ok: false, code: "TIMEOUT" })

    await expect(syncLastSeen({ now })).resolves.toEqual({ ok: false, code: "TIMEOUT" })
    expect(getOldestPlay).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("reads the active Tautulli with the caller's signal, and only members with a Plex account", async () => {
    const signal = new AbortController().signal
    await syncLastSeen({ now, signal })

    expect(getActiveService).toHaveBeenCalledWith("tautulli")
    expect(listTautulliLastSeen).toHaveBeenCalledWith(tautulli, { signal })
    expect(getOldestPlay).toHaveBeenCalledWith(tautulli, { signal })
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { plexUserId: { not: null } },
      select: { id: true, plexUserId: true, lastSeenAt: true },
    })
  })

  it("matches members by plex.tv id and stamps each one the read found", async () => {
    read([
      { userId: 1, lastSeen: day("2026-10-01"), keepHistory: true },
      { userId: 2, lastSeen: null, keepHistory: true },
      { userId: 3, lastSeen: day("2026-10-02"), keepHistory: false },
      { userId: 9, lastSeen: day("2026-10-03"), keepHistory: true },
    ])
    members([
      { id: "u1", plexUserId: " 1 ", lastSeenAt: null },
      { id: "u2", plexUserId: "2", lastSeenAt: null },
      { id: "u3", plexUserId: "3", lastSeenAt: null },
      { id: "u4", plexUserId: "4", lastSeenAt: day("2026-01-01") },
    ])

    const result = await syncLastSeen({ now })

    expect(written()).toEqual({
      u1: { lastSeenAt: day("2026-10-01"), lastSeenReadAt: now },
      u2: { lastSeenAt: null, lastSeenReadAt: now },
    })
    expect(result).toEqual({ ok: true, tautulliUsers: 4, matched: 2, newestPlayAt: day("2026-10-03"), oldestPlayAt: historyStart })
  })

  it("never moves last seen backwards", async () => {
    read([
      { userId: 1, lastSeen: day("2026-05-01"), keepHistory: true },
      { userId: 2, lastSeen: null, keepHistory: true },
      { userId: 3, lastSeen: day("2026-09-01"), keepHistory: true },
    ])
    members([
      { id: "u1", plexUserId: "1", lastSeenAt: day("2026-08-01") },
      { id: "u2", plexUserId: "2", lastSeenAt: day("2026-08-01") },
      { id: "u3", plexUserId: "3", lastSeenAt: day("2026-08-01") },
    ])

    await syncLastSeen({ now })

    expect(written()).toEqual({
      u1: { lastSeenAt: day("2026-08-01"), lastSeenReadAt: now },
      u2: { lastSeenAt: day("2026-08-01"), lastSeenReadAt: now },
      u3: { lastSeenAt: day("2026-09-01"), lastSeenReadAt: now },
    })
  })

  it("stores a play dated after now as now, so a wrong clock cannot pin last seen in the future", async () => {
    read([
      { userId: 1, lastSeen: day("2027-10-31"), keepHistory: true },
      { userId: 2, lastSeen: day("2027-10-31"), keepHistory: true },
      { userId: 3, lastSeen: day("2027-10-31"), keepHistory: true },
    ])
    members([
      { id: "u1", plexUserId: "1", lastSeenAt: day("2026-08-01") },
      { id: "u2", plexUserId: "2", lastSeenAt: null },
      // Stored before the clamp: never moved back
      { id: "u3", plexUserId: "3", lastSeenAt: day("2028-01-01") },
    ])

    await expect(syncLastSeen({ now })).resolves.toMatchObject({ newestPlayAt: null })

    expect(written()).toEqual({
      u1: { lastSeenAt: now, lastSeenReadAt: now },
      u2: { lastSeenAt: now, lastSeenReadAt: now },
      u3: { lastSeenAt: day("2028-01-01"), lastSeenReadAt: now },
    })
  })

  it("keeps a play exactly at now as it is", async () => {
    read([{ userId: 1, lastSeen: new Date(now), keepHistory: true }])
    members([{ id: "u1", plexUserId: "1", lastSeenAt: null }])

    await expect(syncLastSeen({ now })).resolves.toMatchObject({ newestPlayAt: now })
    expect(written()).toEqual({ u1: { lastSeenAt: now, lastSeenReadAt: now } })
  })

  it("takes the newest play on the server from every row, but none dated after now", async () => {
    read([
      { userId: 1, lastSeen: day("2026-10-20"), keepHistory: false },
      { userId: 2, lastSeen: day("2026-10-10"), keepHistory: true },
      { userId: 3, lastSeen: day("2036-01-01"), keepHistory: true },
    ])

    await expect(syncLastSeen({ now })).resolves.toMatchObject({ newestPlayAt: day("2026-10-20") })
  })

  it("has no newest play when Tautulli has none", async () => {
    read([{ userId: 1, lastSeen: null, keepHistory: true }])

    await expect(syncLastSeen({ now })).resolves.toEqual({ ok: true, tautulliUsers: 1, matched: 0, newestPlayAt: null, oldestPlayAt: historyStart })
  })

  it("passes on when Tautulli's history starts, or null when it has none", async () => {
    await expect(syncLastSeen({ now })).resolves.toMatchObject({ ok: true, oldestPlayAt: historyStart })

    jest.mocked(getOldestPlay).mockResolvedValue({ ok: true, data: null })
    await expect(syncLastSeen({ now })).resolves.toMatchObject({ ok: true, oldestPlayAt: null })
  })

  it("still writes last seen when the oldest play cannot be read, with no oldest play", async () => {
    jest.mocked(getOldestPlay).mockResolvedValue({ ok: false, code: "TIMEOUT" })
    read([{ userId: 1, lastSeen: day("2026-10-01"), keepHistory: true }])
    members([{ id: "u1", plexUserId: "1", lastSeenAt: null }])

    await expect(syncLastSeen({ now })).resolves.toEqual({ ok: true, tautulliUsers: 1, matched: 1, newestPlayAt: day("2026-10-01"), oldestPlayAt: null })
    expect(written()).toEqual({ u1: { lastSeenAt: day("2026-10-01"), lastSeenReadAt: now } })
    expect(mockWarn).toHaveBeenCalledWith("inactivity.oldest_play_failed", { code: "TIMEOUT", status: undefined })
  })

  it("writes in transactions of at most one chunk", async () => {
    const count = SYNC_CHUNK * 2 + 50
    read(Array.from({ length: count }, (_, index) => ({ userId: index, lastSeen: null, keepHistory: true })))
    members(Array.from({ length: count }, (_, index) => ({ id: `u${index}`, plexUserId: String(index), lastSeenAt: null })))

    await expect(syncLastSeen({ now })).resolves.toMatchObject({ matched: count })

    expect(prismaMock.$transaction.mock.calls.map(([batch]) => (Array.isArray(batch) ? batch.length : 0))).toEqual([SYNC_CHUNK, SYNC_CHUNK, 50])
  })
})
