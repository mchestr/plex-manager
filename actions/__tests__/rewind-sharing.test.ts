/**
 * @jest-environment node
 *
 * Tests for actions/rewind-sharing.ts (P5.11, design 6.2): opt-in v3 links
 * with hashed tokens and asset keys, rotation, revocation, the season-close
 * expiry, the 10-an-hour limit and one audit entry per action.
 *
 * The Prisma mock keeps a small in-memory RewindShare table, so the tests
 * check what is stored rather than which calls were made.
 */

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import {
  disableRewindShare,
  enableRewindShare,
  rotateRewindShare,
  saveRewindSharePrefs,
  updateRewindShare,
} from "@/actions/rewind-sharing"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { Prisma, type PlexWrapped, type RewindShare } from "@/lib/generated/prisma/client"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/actions/entitlement", () => ({ hasEntitlement: jest.fn(), NOT_ENTITLED_MESSAGE: "This needs an active membership." }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn().mockResolvedValue("America/Chicago") }))
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

process.env.NEXT_PUBLIC_APP_URL = "https://plex.example.com"

const YEAR = 2026
let v3Data: string
let wrapped: PlexWrapped[]
let shares: RewindShare[]
let memberId: string
let counter = 0

beforeAll(async () => {
  v3Data = JSON.stringify(await fixtureRewind("heavy"))
})

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1)

function seedRewind(overrides: Partial<PlexWrapped> = {}): PlexWrapped {
  const row = buildPlexWrapped({ id: `wrapped-${memberId}`, userId: memberId, year: YEAR, data: v3Data, dataVersion: 3, ...overrides })
  wrapped.push(row)
  return row
}

function withWrapped(share: RewindShare) {
  return { ...share, wrapped: wrapped.find((w) => w.id === share.wrappedId)! }
}

function installTables() {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: true }))
  prismaMock.plexWrapped.findUnique.mockImplementation((async ({ where }: { where: { userId_year: { userId: string; year: number } } }) =>
    wrapped.find((w) => w.userId === where.userId_year.userId && w.year === where.userId_year.year) ?? null) as never)
  prismaMock.rewindShare.findFirst.mockImplementation((async ({ where }: { where: { wrappedId: string; id?: { not: string } } }) =>
    shares.find(
      (s) => s.wrappedId === where.wrappedId && s.id !== where.id?.not && !s.revokedAt && (!s.expiresAt || s.expiresAt > new Date())
    ) ?? null) as never)
  prismaMock.rewindShare.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => {
    const share = shares.find((s) => s.id === where.id)
    return share ? withWrapped(share) : null
  }) as never)
  prismaMock.rewindShare.create.mockImplementation((async ({ data }: { data: Partial<RewindShare> }) => {
    const share = buildRewindShare({ ...data, id: `share-${shares.length + 1}`, rotatedFromId: data.rotatedFromId ?? null, expiresAt: data.expiresAt ?? null })
    shares.push(share)
    return share
  }) as never)
  prismaMock.rewindShare.update.mockImplementation((async ({ where, data }: { where: { id: string }; data: Partial<RewindShare> }) => {
    const share = shares.find((s) => s.id === where.id)!
    Object.assign(share, data)
    return share
  }) as never)
  prismaMock.rewindShare.updateMany.mockImplementation((async ({ where, data }: { where: { id: string; revokedAt: null }; data: Partial<RewindShare> }) => {
    const share = shares.find((s) => s.id === where.id && !s.revokedAt)
    if (share) Object.assign(share, data)
    return { count: share ? 1 : 0 }
  }) as never)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
}

const OPTIONS = { pages: ["cover", "top-shows"] as const, signed: false, includeArt: false, dailyDetail: false, cardFacts: [] }
const enable = (overrides: Record<string, unknown> = {}) => enableRewindShare({ year: YEAR, ...OPTIONS, pages: [...OPTIONS.pages], ...overrides })

async function enabled() {
  const result = await enable()
  if (!result.success) throw new Error(result.error)
  return result.data
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(logAuditEvent).mockClear()
  wrapped = []
  shares = []
  counter += 1
  memberId = `member-${counter}`
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: memberId, isAdmin: false }, expires: "2099-01-01" })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  installTables()
})

describe("enableRewindShare", () => {
  it("stores only the token's hash beside a separate asset key, and returns the URL once", async () => {
    seedRewind()
    const data = await enabled()
    const token = tokenOf(data.url)
    expect(data.url).toBe(`https://plex.example.com/rewind/s/${token}`)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(shares).toHaveLength(1)
    expect(shares[0].tokenHash).toBe(sha256(token))
    expect(shares[0].assetKey).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(JSON.stringify(shares[0])).not.toContain(token)
  })

  it("expires at the end of the season's close day in the server zone", async () => {
    jest.useFakeTimers({ now: new Date("2026-12-05T12:00:00Z"), advanceTimers: true })
    try {
      seedRewind()
      await enabled()
      // 2027-01-31 23:59:59 in America/Chicago (UTC-6)
      expect(shares[0].expiresAt?.toISOString()).toBe("2027-02-01T05:59:59.000Z")
    } finally {
      jest.useRealTimers()
    }
  })

  it("ends a chosen date at its last second in the server zone, and refuses a date that has passed", async () => {
    jest.useFakeTimers({ now: new Date("2026-12-05T12:00:00Z"), advanceTimers: true })
    try {
      seedRewind()
      expect(await enable({ expiresAt: "2026-12-01" })).toMatchObject({ success: false, code: "VALIDATION" })
      expect(shares).toHaveLength(0)
      await enabled()
      expect((await enable({ expiresAt: "2026-12-31" })).success).toBe(false)
      shares.length = 0
      await enable({ expiresAt: "2026-12-31" })
      // 2026-12-31 23:59:59 in America/Chicago (UTC-6)
      expect(shares[0].expiresAt?.toISOString()).toBe("2027-01-01T05:59:59.000Z")
    } finally {
      jest.useRealTimers()
    }
  })

  it("moves the default expiry to next year's close once a season within one year has closed", async () => {
    jest.useFakeTimers({ now: new Date("2026-05-10T12:00:00Z"), advanceTimers: true })
    try {
      prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: true, rewindSeasonOpens: "03-01", rewindSeasonCloses: "04-30" }))
      seedRewind()
      await enabled()
      // 2027-04-30 23:59:59 in America/Chicago (UTC-5), not this year's close, which has passed
      expect(shares[0].expiresAt?.toISOString()).toBe("2027-05-01T04:59:59.000Z")
    } finally {
      jest.useRealTimers()
    }
  })

  it("answers the losing request of a race with CONFLICT, not a generic error", async () => {
    seedRewind()
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "7" })
    )
    expect(await enable()).toMatchObject({ success: false, code: "CONFLICT" })
    expect(shares).toHaveLength(0)
  })

  it("stores no expiry when the member chooses none", async () => {
    seedRewind()
    await enable({ expiresAt: "never" })
    expect(shares[0].expiresAt).toBeNull()
  })

  it("refuses another member's row, a v2 row and an unfinished row", async () => {
    wrapped.push(buildPlexWrapped({ id: "theirs", userId: "someone-else", year: YEAR, data: v3Data, dataVersion: 3 }))
    expect((await enable()).success).toBe(false)

    const v2 = readFileSync(path.join(__dirname, "../../lib/wrapped/data/__tests__/fixtures/stored-v2.json"), "utf8")
    const row = seedRewind({ data: v2, dataVersion: 2 })
    expect(await enable()).toMatchObject({ success: false, code: "CONFLICT" })

    row.data = v3Data
    row.status = "generating"
    expect(await enable()).toMatchObject({ success: false, code: "CONFLICT" })
    expect(shares).toHaveLength(0)
  })

  it("refuses pages the issue did not print", async () => {
    seedRewind()
    expect(await enable({ pages: ["guess"] })).toMatchObject({ success: false, code: "VALIDATION" })
  })

  it("is refused while public links are off", async () => {
    seedRewind()
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: false }))
    expect(await enable()).toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(shares).toHaveLength(0)
  })

  it("is refused for a lapsed member", async () => {
    seedRewind()
    jest.mocked(hasEntitlement).mockResolvedValue(false)
    expect(await enable()).toEqual({ success: false, code: "NOT_ENTITLED", error: "Sharing needs an active membership" })
  })

  it("limits a member to 10 share actions an hour", async () => {
    seedRewind()
    const { shareId } = await enabled()
    for (let i = 0; i < 9; i++) expect((await updateRewindShare({ shareId, signed: i % 2 === 0 })).success).toBe(true)
    expect(await updateRewindShare({ shareId, signed: true })).toMatchObject({ success: false, code: "RATE_LIMITED" })
  })
})

describe("rotate, update and disable", () => {
  it("rotation revokes the old token and asset key and creates a new link on the same settings", async () => {
    seedRewind()
    const first = await enabled()
    const result = await rotateRewindShare({ shareId: first.shareId })
    if (!result.success) throw new Error(result.error)
    const [old, next] = shares
    expect(old.revokedAt).not.toBeNull()
    expect(next.rotatedFromId).toBe(old.id)
    expect(next.tokenHash).toBe(sha256(tokenOf(result.data.url)))
    expect(next.tokenHash).not.toBe(old.tokenHash)
    expect(next.assetKey).not.toBe(old.assetKey)
    expect(next.pages).toEqual(old.pages)
  })

  it("lets a lapsed member stop or rotate a link, but not change one", async () => {
    seedRewind()
    const { shareId } = await enabled()
    jest.mocked(hasEntitlement).mockResolvedValue(false)
    expect(await updateRewindShare({ shareId, signed: true })).toMatchObject({ success: false, code: "NOT_ENTITLED" })
    const rotated = await rotateRewindShare({ shareId })
    if (!rotated.success) throw new Error(rotated.error)
    expect((await disableRewindShare({ shareId: rotated.data.shareId })).success).toBe(true)
    expect(shares.every((s) => s.revokedAt !== null)).toBe(true)
  })

  it("rotates an expired link to one that is live, and lets only one of two rotations through", async () => {
    seedRewind()
    const { shareId } = await enabled()
    shares[0].expiresAt = new Date(Date.now() - 60_000)
    const rotated = await rotateRewindShare({ shareId })
    if (!rotated.success) throw new Error(rotated.error)
    expect(new Date(rotated.data.expiresAt!).getTime()).toBeGreaterThan(Date.now())

    // A second rotation of the same (now revoked) link finds it already replaced.
    shares[0].revokedAt = null
    prismaMock.rewindShare.updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await rotateRewindShare({ shareId })).toMatchObject({ success: false, code: "CONFLICT" })
    expect(shares).toHaveLength(2)
  })

  it("will not rotate an expired link back to life beside a newer live one", async () => {
    seedRewind()
    const { shareId: expiredId } = await enabled()
    shares[0].expiresAt = new Date(Date.now() - 60_000)
    await enabled()

    expect(await rotateRewindShare({ shareId: expiredId })).toMatchObject({ success: false, code: "CONFLICT" })
    expect(shares).toHaveLength(2)
  })

  it("answers a serialization failure on rotate with CONFLICT", async () => {
    seedRewind()
    const { shareId } = await enabled()
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("could not serialize", { code: "P2034", clientVersion: "7" })
    )
    expect(await rotateRewindShare({ shareId })).toMatchObject({ success: false, code: "CONFLICT" })
  })

  it("refuses another member's link", async () => {
    seedRewind()
    const { shareId } = await enabled()
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "intruder", isAdmin: false }, expires: "2099-01-01" })
    expect(await disableRewindShare({ shareId })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(await rotateRewindShare({ shareId })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(shares[0].revokedAt).toBeNull()
  })

  it("updates what a link publishes without a new token", async () => {
    seedRewind()
    const { shareId } = await enabled()
    const hash = shares[0].tokenHash
    expect((await updateRewindShare({ shareId, pages: ["clock"], signed: true })).success).toBe(true)
    expect(shares[0]).toMatchObject({ pages: ["clock"], signed: true, tokenHash: hash })
  })
})

it("writes one audit entry per action, with no token in it", async () => {
  seedRewind()
  const { shareId, url } = await enabled()
  await updateRewindShare({ shareId, signed: true })
  const rotated = await rotateRewindShare({ shareId })
  if (!rotated.success) throw new Error(rotated.error)
  await disableRewindShare({ shareId: rotated.data.shareId })

  const calls = jest.mocked(logAuditEvent).mock.calls
  expect(calls.map(([type]) => type)).toEqual([
    AuditEventType.REWIND_SHARE_CREATED,
    AuditEventType.REWIND_SHARE_UPDATED,
    AuditEventType.REWIND_SHARE_ROTATED,
    AuditEventType.REWIND_SHARE_REVOKED,
  ])
  const logged = JSON.stringify(calls)
  for (const token of [tokenOf(url), tokenOf(rotated.data.url)]) expect(logged).not.toContain(token)
  expect(calls[0][2]).toMatchObject({ shareId, pages: ["cover", "top-shows"] })
})

it("saves the share sheet's choices per member and year", async () => {
  prismaMock.rewindPrefs.upsert.mockResolvedValue({} as never)
  const result = await saveRewindSharePrefs({ year: YEAR, signed: true, includeArt: false, dailyDetail: true, cardFacts: ["hours.peak"] })
  expect(result.success).toBe(true)
  expect(prismaMock.rewindPrefs.upsert).toHaveBeenCalledWith({
    where: { userId_year: { userId: memberId, year: YEAR } },
    create: { userId: memberId, year: YEAR, signed: true, includeArt: false, dailyDetail: true, cardFacts: ["hours.peak"] },
    update: { signed: true, includeArt: false, dailyDetail: true, cardFacts: ["hours.peak"] },
  })
})
