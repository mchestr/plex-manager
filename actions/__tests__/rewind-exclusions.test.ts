/**
 * @jest-environment node
 *
 * Tests for actions/rewind-exclusions.ts (P7.7, FR-7): ownership through the
 * member's own completed Rewind, 20 changes a day, no entitlement check, one
 * transaction for the row and the version, and a no-LLM regeneration that
 * spends no `rw:gen` point.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildPlexWrapped } from "@/__tests__/helpers/factories"
import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { hideRewindTitle, unhideRewindTitle } from "@/actions/rewind-exclusions"
import { hasEntitlement } from "@/lib/actions/entitlement"
import type { PlexWrapped } from "@/lib/generated/prisma/client"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { enqueueRewindGeneration } from "@/lib/rewind/enqueue-generation"
import { ratingKeyOf } from "@/lib/rewind/pages/title-key"
import type { TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/actions/entitlement", () => ({ hasEntitlement: jest.fn(), NOT_ENTITLED_MESSAGE: "This needs an active membership." }))
jest.mock("@/lib/queue/rewind-infra", () => ({ checkRewindInfra: jest.fn() }))
jest.mock("@/lib/rewind/enqueue-generation", () => ({ enqueueRewindGeneration: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => {
  const actual = jest.requireActual("@/lib/security/rate-limit")
  return { ...actual, consume: jest.fn(actual.consume) }
})
jest.mock("@/lib/security/audit-log", () => ({
  ...jest.requireActual("@/lib/security/audit-log"),
  logAuditEvent: jest.fn(),
}))

const YEAR = 2026
let rewind: RewindDataV3
let no1: { ratingKey: string; title: string }
let wrapped: PlexWrapped[]
let memberId: string
let counter = 0

beforeAll(async () => {
  rewind = await fixtureRewind("heavy")
  const page = rewind.pages.find((p) => p.type === "top-shows")!.data as TopShowsData
  no1 = { ratingKey: ratingKeyOf(page.rows[0].key), title: rewind.facts["series[1].title"]!.display }
})

function seedRewind(userId: string) {
  wrapped.push(buildPlexWrapped({ id: `wrapped-${userId}`, userId, year: YEAR, data: JSON.stringify(rewind), dataVersion: 3 }))
}

const hide = (ratingKey = no1.ratingKey) => hideRewindTitle({ year: YEAR, ratingKey, kind: "series" })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  wrapped = []
  counter += 1
  memberId = `hider-${counter}`
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: memberId, isAdmin: false }, expires: "2099-01-01" })
  jest.mocked(checkRewindInfra).mockResolvedValue({ ok: true })
  jest.mocked(enqueueRewindGeneration).mockResolvedValue({ alreadyQueued: false, generationId: "gen-1" })
  prismaMock.plexWrapped.findUnique.mockImplementation((async ({ where }: { where: { userId_year: { userId: string; year: number } } }) =>
    wrapped.find((w) => w.userId === where.userId_year.userId && w.year === where.userId_year.year) ?? null) as never)
  prismaMock.plexWrapped.findMany.mockResolvedValue([])
  prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => Promise<unknown>) => fn(asTransactionClient(prismaMock))) as never)
  seedRewind(memberId)
})

describe("hideRewindTitle", () => {
  it("treats hiding a title that is already hidden as done, with no point spent and no regeneration", async () => {
    prismaMock.rewindExclusion.findUnique.mockResolvedValue({ id: "ex-1" } as never)
    expect(await hide()).toEqual({ success: true, data: { regenerating: false } })
    expect(consume).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(enqueueRewindGeneration).not.toHaveBeenCalled()
  })

  it("writes the row and bumps the version in one transaction, then enqueues a no-LLM run", async () => {
    prismaMock.plexWrapped.findMany.mockResolvedValue([{ year: YEAR }, { year: 2025 }] as never)
    expect(await hide()).toEqual({ success: true, data: { regenerating: true } })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.rewindExclusion.upsert).toHaveBeenCalledWith({
      where: { userId_ratingKey: { userId: memberId, ratingKey: no1.ratingKey } },
      create: { userId: memberId, ratingKey: no1.ratingKey, kind: "series", title: no1.title },
      update: {},
    })
    // A hide holds in every year: each year with a Rewind gets a prefs row (2025 had none), then every row is bumped
    expect(prismaMock.rewindPrefs.createMany).toHaveBeenCalledWith({
      data: [
        { userId: memberId, year: YEAR, exclusionsVersion: 0 },
        { userId: memberId, year: 2025, exclusionsVersion: 0 },
      ],
      skipDuplicates: true,
    })
    expect(prismaMock.rewindPrefs.updateMany).toHaveBeenCalledWith({
      where: { userId: memberId },
      data: { exclusionsVersion: { increment: 1 } },
    })
    // The exclusion run: copyPolicy no-llm, the rewind:hide dedup id and the 5 s delay (enqueue-generation)
    expect(enqueueRewindGeneration).toHaveBeenCalledWith({ userId: memberId, year: YEAR, kind: "member", exclusion: {} })
    expect(consume).toHaveBeenCalledWith("rw:hide", memberId)
    expect(jest.mocked(consume).mock.calls.some(([name]) => name.startsWith("rw:gen"))).toBe(false)
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.REWIND_TITLE_HIDDEN, memberId, { year: YEAR, ratingKey: no1.ratingKey, kind: "series" })
    expect(JSON.stringify(jest.mocked(logAuditEvent).mock.calls)).not.toContain(no1.title)
  })

  it("refuses a key outside the member's Rewind, and another member's key", async () => {
    expect(await hide("999999999")).toMatchObject({ success: false, code: "NOT_FOUND" })

    // Another member's Rewind holds the key; this member has none.
    wrapped = []
    seedRewind("someone-else")
    expect(await hide()).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(enqueueRewindGeneration).not.toHaveBeenCalled()
  })

  it("refuses a key that is not a rating key", async () => {
    expect(await hideRewindTitle({ year: YEAR, ratingKey: "../etc", kind: "series" })).toMatchObject({ success: false, code: "VALIDATION" })
    expect(await hideRewindTitle({ year: YEAR, ratingKey: no1.ratingKey, kind: "album" } as never)).toMatchObject({ success: false, code: "VALIDATION" })
  })

  it("limits a member to 20 changes a day", async () => {
    for (let i = 0; i < 20; i++) expect((await hide()).success).toBe(true)
    expect(await hide()).toMatchObject({ success: false, code: "RATE_LIMITED" })
  })

  it("lets a lapsed subscriber hide", async () => {
    jest.mocked(hasEntitlement).mockResolvedValue(false)
    expect(await hide()).toMatchObject({ success: true })
  })

  it("with Redis down returns the FR-50 error and writes nothing", async () => {
    jest.mocked(checkRewindInfra).mockResolvedValue({ ok: false, code: "REDIS_UNAVAILABLE" })

    expect(await hide()).toMatchObject({ success: false, code: "REDIS_UNAVAILABLE" })

    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.rewindExclusion.upsert).not.toHaveBeenCalled()
    expect(enqueueRewindGeneration).not.toHaveBeenCalled()
  })
})

describe("unhideRewindTitle", () => {
  it("deletes the member's own row, bumps the version and regenerates", async () => {
    prismaMock.rewindExclusion.findUnique.mockResolvedValue({ id: "ex-1" } as never)

    expect(await unhideRewindTitle({ year: YEAR, ratingKey: no1.ratingKey, kind: "series" })).toEqual({ success: true, data: { regenerating: true } })

    expect(prismaMock.rewindExclusion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_ratingKey: { userId: memberId, ratingKey: no1.ratingKey } } })
    )
    expect(prismaMock.rewindExclusion.deleteMany).toHaveBeenCalledWith({ where: { userId: memberId, ratingKey: no1.ratingKey } })
    expect(prismaMock.rewindPrefs.updateMany).toHaveBeenCalledTimes(1)
    expect(enqueueRewindGeneration).toHaveBeenCalledWith({ userId: memberId, year: YEAR, kind: "member", exclusion: {} })
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.REWIND_TITLE_UNHIDDEN, memberId, { year: YEAR, ratingKey: no1.ratingKey, kind: "series" })
  })

  it("refuses a title the member has not hidden", async () => {
    prismaMock.rewindExclusion.findUnique.mockResolvedValue(null)
    expect(await unhideRewindTitle({ year: YEAR, ratingKey: no1.ratingKey, kind: "series" })).toMatchObject({ success: false, code: "NOT_FOUND" })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
