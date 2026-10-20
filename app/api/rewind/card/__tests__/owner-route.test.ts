/**
 * @jest-environment node
 *
 * The owner's card route (P5.10): authorise, then the disk cache, then the
 * limiter, then the render; 404 for anything unauthorised; noindex always.
 */

import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { buildConfig, buildPlexWrapped } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET } from "@/app/api/rewind/card/[rewindId]/[page]/route"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { renderCardPng } from "@/lib/rewind/cards/render"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { CARD_FACT_IDS } from "@/lib/wrapped/data/share-safe-schema"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/actions/entitlement", () => ({ hasEntitlement: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-US" }),
}))
jest.mock("@/lib/rewind/cards/render", () => ({
  renderCardPng: jest.fn(async (input: unknown) => Buffer.from(JSON.stringify(input))),
}))

const session = (id: string) => ({ user: { id, isAdmin: false }, expires: "2099-01-01" })

let heavy: RewindDataV3
let dir: string
let userId: string
let users = 0

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(renderCardPng).mockClear()
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-owner-cards-"))
  process.env.REWIND_CACHE_DIR = dir
  // A fresh member per test, so the in-memory limiter starts empty
  userId = `member-${++users}`
  jest.mocked(getServerSession).mockResolvedValue(session(userId))
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  prismaMock.plexWrapped.findFirst.mockResolvedValue(buildPlexWrapped({ id: "wrapped-1", userId, data: JSON.stringify(heavy), dataVersion: 3 }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function get(page: string, query = "", rewindId = "wrapped-1") {
  const request = new NextRequest(`http://localhost/api/rewind/card/${rewindId}/${page}${query}`)
  return GET(request, { params: Promise.resolve({ rewindId, page }) })
}

describe("GET /api/rewind/card/[rewindId]/[page]", () => {
  it("renders the owner's cover as a PNG, privately cached for a day, with noindex", async () => {
    const response = await get("cover")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/png")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400")
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
  })

  it("looks the row up by id and the session's own user id", async () => {
    prismaMock.plexWrapped.findFirst.mockResolvedValue(null)
    jest.mocked(getServerSession).mockResolvedValue(session("someone-else"))
    const response = await get("cover")
    expect(prismaMock.plexWrapped.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "wrapped-1", userId: "someone-else" } }))
    expect(response.status).toBe(404)
  })

  it.each([
    ["another member's row", () => prismaMock.plexWrapped.findFirst.mockResolvedValue(null)],
    ["no session", () => jest.mocked(getServerSession).mockResolvedValue(null)],
    ["no entitlement with Stripe on", () => jest.mocked(hasEntitlement).mockResolvedValue(false)],
    [
      "a row that is not completed",
      () => prismaMock.plexWrapped.findFirst.mockResolvedValue(buildPlexWrapped({ userId, status: "generating", data: JSON.stringify(heavy) })),
    ],
  ])("answers 404 for %s, with noindex", async (_name, arrange) => {
    arrange()
    const response = await get("cover")
    expect(response.status).toBe(404)
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
    expect(renderCardPng).not.toHaveBeenCalled()
  })

  it("asks for the full entitlement", async () => {
    await get("cover")
    expect(hasEntitlement).toHaveBeenCalledWith(userId, "full")
  })

  it("answers 404 for a page the issue did not print, or that has no card yet", async () => {
    expect((await get("standing")).status).toBe(404)
    expect((await get("top-films")).status).toBe(404)
    expect((await get("not-a-page")).status).toBe(404)
  })

  it("refuses square cards and bad options with a 400 and noindex", async () => {
    for (const query of ["?size=square", "?facts=userId", "?signed=yes"]) {
      const response = await get("cover", query)
      expect(response.status).toBe(400)
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
    }
  })

  it("serves a cache hit without rendering again or spending a limit point", async () => {
    await get("cover")
    expect(renderCardPng).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 70; i++) expect((await get("cover")).status).toBe(200)
    expect(renderCardPng).toHaveBeenCalledTimes(1)
  })

  it("limits renders to 60 a minute per member: the 61st miss gets a 429", async () => {
    // 61 distinct options, so every request is a cache miss
    const pairs = CARD_FACT_IDS.flatMap((a, i) => [a, ...CARD_FACT_IDS.slice(i + 1).map((b) => `${a},${b}`)])
    const variants = ["0", "1"].flatMap((signed) => pairs.map((facts) => `?signed=${signed}&facts=${facts}`))
    const statuses: number[] = []
    for (const query of variants.slice(0, 61)) statuses.push((await get("cover", query)).status)
    expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true)
    const last = await get("cover", variants[60])
    expect(statuses[60]).toBe(429)
    expect(last.headers.get("X-Robots-Tag")).toBe("noindex")
    expect(last.headers.get("Retry-After")).toBeTruthy()
  })
})
