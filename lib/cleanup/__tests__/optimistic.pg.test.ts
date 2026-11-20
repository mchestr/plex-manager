/**
 * @jest-environment node
 */

/**
 * The optimistic writes of runs and act steps on PostgreSQL (TS 16.3, E5,
 * E25). A Keep that commits during a run, between reconcile's read and its
 * write: the write matches zero rows and skips, and the new-match step does
 * not add the title back. A postpone that commits during an act step, after
 * the item's re-read: the `deleting` write matches zero rows, and nothing is
 * deleted. A dry run that ends after the editor loaded the rule leaves its
 * `revision`, so the save's compare-and-set passes. Two saves with the same
 * expected revision: the second matches zero rows (`CONFLICT`).
 *
 * The concurrent writer is a second client that commits inside a hook on the
 * first client's `cleanupItem.updateMany`. Only the upstream connections are
 * mocked. Gated by `describePg` and run only by `npm run test:integration`.
 * The suite empties the cleanup tables before each case.
 */

import { PrismaPg } from "@prisma/adapter-pg"
import type { Job } from "bullmq"

import { describePg } from "@/__tests__/helpers/integration"
import { buildCondition, buildDefinition, buildMovieItem, buildSnapshotFacts, buildSourceStatuses, buildWhySnapshot } from "@/lib/cleanup/__tests__/helpers/builders"
import { keepActiveKey } from "@/lib/cleanup/protections"
import { runCleanup } from "@/lib/cleanup/run/run"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { serverZone } from "@/lib/cleanup/settings"
import { resetSnapshotCache } from "@/lib/cleanup/snapshot/cache"
import { createSnapshotHeader, writeSnapshot } from "@/lib/cleanup/snapshot/store"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { getCleanupProcessor } from "@/lib/queue/jobs/cleanup"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))
const mockUp = { active: jest.fn(), getRadarrMovie: jest.fn(), roots: jest.fn(), tags: jest.fn(), deleteRadarrMovie: jest.fn(), getPlexMetadata: jest.fn(),
  readPlayingKeys: jest.fn(), forEachRequest: jest.fn(), forEachHistoryRow: jest.fn(), ok: jest.fn() }
function mockCall(name: keyof typeof mockUp) {
  return (...args: unknown[]) => mockUp[name](...args)
}
jest.mock("@/lib/data/active-service", () => ({ getActiveService: mockCall("active") }))
jest.mock("@/lib/connections/radarr-library", () => ({ getRadarrMovie: mockCall("getRadarrMovie"), listRadarrRootFolders: mockCall("roots"), listRadarrTags: mockCall("tags") }))
jest.mock("@/lib/connections/sonarr-library", () => ({ listSonarrRootFolders: mockCall("roots"), listSonarrTags: mockCall("tags") }))
jest.mock("@/lib/connections/radarr-write", () => ({ deleteRadarrMovie: mockCall("deleteRadarrMovie") }))
jest.mock("@/lib/connections/plex-library-read", () => ({ getPlexMetadata: mockCall("getPlexMetadata") }))
jest.mock("@/lib/connections/plex-playing", () => ({ readPlayingKeys: mockCall("readPlayingKeys") }))
jest.mock("@/lib/connections/plex-collections", () => ({ removePlexCollectionItem: mockCall("ok") }))
jest.mock("@/lib/connections/plex-scan", () => ({ refreshPlexPath: mockCall("ok") }))
jest.mock("@/lib/connections/overseerr-cleanup", () => ({ forEachRequest: mockCall("forEachRequest"), runOverseerrJob: mockCall("ok") }))
jest.mock("@/lib/connections/tautulli-history-all", () => ({ forEachHistoryRow: mockCall("forEachHistoryRow") }))

const MEMBER = `optimistic-member-${Date.now()}`
const nowS = () => Math.floor(Date.now() / 1000)
const MATCHES: RuleDefinition = buildDefinition({ libraries: ["1"], then: { graceDays: 1, action: "movie.delete", importListExclusion: false },
  conditions: [buildCondition("watch.lastPlayed", { value: { duration: { amount: 90, unit: "days" }, orNever: true } })] })
const ITEM: SnapshotItem = buildMovieItem({ key: "movie:tmdb:901", titleKey: "tmdb:901", ratingKey: "7901", copies: [{ ratingKey: "7901", sectionId: "1" }],
  ids: { tmdb: 901 }, arr: { service: "radarr", id: 901, titleSlug: "invented-901", path: "/media/movies/Invented 901", root: "/media/movies", tags: [],
    importList: false, monitored: true, fileId: 1 } })
const TABLES = ["cleanupOutcome", "cleanupItem", "cleanupProtection", "cleanupRun", "cleanupRule", "cleanupSnapshot", "cleanupSettings"] as const
let realDb: PrismaClient
let today = ""
/** Runs once, inside the first `cleanupItem.updateMany` of the code under test, before that write. */
let beforeItemWrite: (() => Promise<void>) | null = null

/** The client the code under test uses: `realDb`, with the hook on `cleanupItem.updateMany`. */
function hooked(client: PrismaClient): PrismaClient {
  const items = new Proxy(client.cleanupItem, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop !== "updateMany") return value
      return async (args: Parameters<typeof target.updateMany>[0]) => {
        const hook = beforeItemWrite
        beforeItemWrite = null
        if (hook) await hook()
        return target.updateMany(args)
      }
    },
  })
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "cleanupItem") return items
      const value = Reflect.get(target, prop)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

async function storeSnapshot(items: SnapshotItem[]) {
  const id = await createSnapshotHeader({ trigger: "scheduled", startedAt: new Date(Date.now() - 3_600_000) })
  const facts = buildSnapshotFacts({ takenAt: new Date(Date.now() - 3_600_000).toISOString(), rowBaseline: {},
    history: { startAt: nowS() - 3 * 365 * 86_400, newestAt: nowS() - 86_400, rows: 5000, orphans: 0, usersWithPlay: 12 } })
  await writeSnapshot(id, { parts: { movie: items, show: [], season: [] }, sources: buildSourceStatuses(), facts, finishedAt: new Date() })
  resetSnapshotCache()
}

const seedRule = (revision = 1) => realDb.cleanupRule.create({ data: { id: "rule-a", name: "Old movies", mode: "automatic", revision, definition: MATCHES,
  createdBy: MEMBER } })
const seedItem = () => realDb.cleanupItem.create({ data: { itemKey: ITEM.key, level: "movie", titleKey: ITEM.titleKey, sectionId: "1", ratingKey: ITEM.ratingKey,
  title: ITEM.title, sizeBytes: 5n * 1024n ** 3n, state: "leaving", ruleIds: ["rule-a"], action: "movie.delete", enteredAt: new Date(Date.now() - 40 * 86_400_000),
  arr: { service: "radarr", id: 901, titleSlug: "invented-901", path: ITEM.arr!.path }, leaveOn: addDays(today, -1), firstLeaveOn: addDays(today, -1),
  checkedAt: new Date(), why: buildWhySnapshot() } })

describePg("the optimistic writes of media cleanup on PostgreSQL", (databaseUrl) => {
  beforeAll(async () => {
    realDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    mockDb = hooked(new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }))
    await realDb.user.create({ data: { id: MEMBER, name: "Invented Member" } })
    today = dayKey(Date.now(), await serverZone())
  })

  beforeEach(async () => {
    for (const table of TABLES) await (realDb[table] as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({})
    await realDb.cleanupSettings.create({ data: { id: "cleanup", enabled: true, options: { protections: { g7: { enabled: false } } } } })
    beforeItemWrite = null
    for (const fn of Object.values(mockUp)) fn.mockReset()
    mockUp.active.mockImplementation(async (kind: string) => (kind === "plex" ? { url: "http://plex.test", token: "t" } : { url: `http://${kind}.test`, apiKey: "k" }))
    mockUp.roots.mockResolvedValue({ ok: true, data: [{ path: "/media/movies" }] })
    mockUp.tags.mockResolvedValue({ ok: true, data: [] })
    mockUp.getRadarrMovie.mockResolvedValue({ ok: true, data: { id: 901, title: ITEM.title, titleSlug: "invented-901", tmdbId: 901, path: ITEM.arr!.path,
      monitored: true, hasFile: true, movieFileId: 1, added: "2024-01-01T00:00:00Z", tags: [] } })
    mockUp.getPlexMetadata.mockResolvedValue({ ok: true, data: { ratingKey: ITEM.ratingKey, type: "movie", Media: [{ Part: [{ file: `${ITEM.arr!.path}/movie.mkv` }] }] } })
    mockUp.readPlayingKeys.mockResolvedValue({ ok: true, data: new Set<string>() })
    mockUp.forEachRequest.mockResolvedValue({ ok: true, data: { rows: 0, pages: 1 } })
    mockUp.forEachHistoryRow.mockResolvedValue({ ok: true, data: { rows: 0, pages: 1, complete: true } })
    mockUp.deleteRadarrMovie.mockResolvedValue({ ok: true, data: { gone: false } })
    mockUp.ok.mockResolvedValue({ ok: true, data: null })
    resetSnapshotCache()
  })

  afterAll(async () => {
    if (!realDb) return
    for (const table of TABLES) await (realDb[table] as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({})
    await realDb.user.deleteMany({ where: { id: MEMBER } })
    await realDb.$disconnect()
    await mockDb.$disconnect()
  })

  it("skips the run's write after a Keep that committed during the run, and the new-match step does not add the title back", async () => {
    await seedRule()
    await storeSnapshot([ITEM])
    const row = await seedItem()
    beforeItemWrite = async () => {
      await realDb.$transaction([
        realDb.cleanupItem.delete({ where: { id: row.id } }),
        realDb.cleanupProtection.create({ data: { kind: "memberKeep", itemKey: ITEM.key, level: "movie", titleKey: ITEM.titleKey, title: ITEM.title, memberId: MEMBER,
          createdBy: MEMBER, expiresAt: new Date(Date.now() + 30 * 86_400_000), activeKey: keepActiveKey(ITEM.key, MEMBER) } }),
      ])
    }
    await expect(runCleanup({ trigger: "admin", actorId: MEMBER, act: false })).resolves.toMatchObject({ busy: false, joined: 0, held: 0 })
    expect(beforeItemWrite).toBeNull()
    expect(await realDb.cleanupItem.count()).toBe(0)
    expect(await realDb.cleanupOutcome.count()).toBe(0)
  })

  it("deletes nothing when a postpone committed during the act step, after the item's re-read", async () => {
    await seedRule()
    await storeSnapshot([ITEM])
    const row = await seedItem()
    mockUp.getRadarrMovie.mockImplementationOnce(async () => {
      await realDb.cleanupItem.update({ where: { id: row.id }, data: { leaveOn: addDays(today, 14), postponedAt: new Date(), postponedBy: MEMBER } })
      return { ok: true, data: { id: 901, title: ITEM.title, titleSlug: "invented-901", tmdbId: 901, path: ITEM.arr!.path, monitored: true, hasFile: true,
        movieFileId: 1, added: "2024-01-01T00:00:00Z", tags: [] } }
    })
    await getCleanupProcessor("cleanup:act")!({ data: { trigger: "approval", actorId: MEMBER } } as unknown as Job)
    expect(mockUp.deleteRadarrMovie).not.toHaveBeenCalled()
    await expect(realDb.cleanupItem.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ state: "leaving", leaveOn: addDays(today, 14) })
  })

  it("leaves the revision after a dry run, so a save of the loaded revision passes, and a second save of it matches nothing", async () => {
    await realDb.cleanupRule.create({ data: { id: "rule-a", name: "Old movies", mode: "dryRun", definition: MATCHES, createdBy: MEMBER } })
    await storeSnapshot([ITEM])
    const loaded = await realDb.cleanupRule.findUniqueOrThrow({ where: { id: "rule-a" } })
    await expect(runCleanup({ trigger: "create", actorId: MEMBER, dryRunRuleIds: ["rule-a"], act: false })).resolves.toMatchObject({ outcome: "dryRun", matched: 1 })
    const after = await realDb.cleanupRule.findUniqueOrThrow({ where: { id: "rule-a" } })
    expect(after.revision).toBe(loaded.revision)
    expect(after.lastDryRunAt).not.toBeNull()
    const save = () => realDb.cleanupRule.updateMany({ where: { id: "rule-a", revision: loaded.revision }, data: { name: "Renamed", revision: { increment: 1 } } })
    await expect(save()).resolves.toEqual({ count: 1 })
    await expect(save()).resolves.toEqual({ count: 0 })
  })
})
