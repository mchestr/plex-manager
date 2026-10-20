/**
 * @jest-environment node
 *
 * The share link's card route (P5.10): a live asset key and a published page
 * or a 404; options from the row, never the query; 30 renders a minute per
 * share; noindex always.
 */

import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET } from "@/app/api/rewind/card/s/[assetKey]/[page]/route"
import { renderCardPng } from "@/lib/rewind/cards/render"
import type { RewindShare } from "@/lib/generated/prisma/client"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-US" }),
}))
jest.mock("@/lib/rewind/cards/render", () => ({
  renderCardPng: jest.fn(async (input: unknown) => Buffer.from(JSON.stringify(input))),
}))

const ASSET_KEY = "Abcdefghijklmnopqrstuv"

let heavy: RewindDataV3
let dir: string
let shares = 0
let shareId: string

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

function liveShare(overrides: Partial<RewindShare> = {}, wrapped = buildPlexWrapped({ data: JSON.stringify(heavy), dataVersion: 3 })) {
  // The route selects the share with its Rewind
  const row = { ...buildRewindShare({ id: shareId, assetKey: ASSET_KEY, ...overrides }), wrapped }
  prismaMock.rewindShare.findUnique.mockResolvedValue(row)
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(renderCardPng).mockClear()
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-share-cards-"))
  process.env.REWIND_CACHE_DIR = dir
  // A fresh share per test, so the in-memory limiter starts empty
  shareId = `share-${++shares}`
  liveShare()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function get(page: string, query = "", assetKey = ASSET_KEY) {
  return GET(new Request(`http://localhost/api/rewind/card/s/${assetKey}/${page}${query}`), {
    params: Promise.resolve({ assetKey, page }),
  })
}

describe("GET /api/rewind/card/s/[assetKey]/[page]", () => {
  it("renders a published page, privately cached for five minutes, with noindex", async () => {
    const response = await get("cover")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/png")
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300")
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
    expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { assetKey: ASSET_KEY } }))
  })

  it.each([
    ["an unknown key", () => prismaMock.rewindShare.findUnique.mockResolvedValue(null)],
    ["a revoked share", () => liveShare({ revokedAt: new Date("2026-12-02T00:00:00Z") })],
    ["a rotated share (its old row is revoked)", () => liveShare({ revokedAt: new Date(), rotatedFromId: null })],
    ["an expired share", () => liveShare({ expiresAt: new Date(Date.now() - 1000) })],
    ["a share of an unfinished Rewind", () => liveShare({}, buildPlexWrapped({ status: "generating", data: JSON.stringify(heavy) }))],
  ])("answers 404 for %s, with noindex", async (_name, arrange) => {
    arrange()
    const response = await get("cover")
    expect(response.status).toBe(404)
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
    expect(renderCardPng).not.toHaveBeenCalled()
  })

  it("answers 404 for a page the link does not publish, and for a malformed key", async () => {
    liveShare({ pages: ["top-shows"] })
    expect((await get("cover")).status).toBe(404)
    expect((await get("cover", "", "too-short")).status).toBe(404)
    expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledTimes(1)
  })

  it("answers 404 for a revoked link even when its card is still on disk", async () => {
    expect((await get("cover")).status).toBe(200)
    liveShare({ revokedAt: new Date() })
    expect((await get("cover")).status).toBe(404)
  })

  it("ignores its query: the options come from the row", async () => {
    await get("cover", "?signed=1&daily=1&art=1&size=og&facts=time.totalHours")
    const input = jest.mocked(renderCardPng).mock.calls[0][0]
    expect(input).toMatchObject({ size: "story", signed: false, daily: false, ownerName: null, cardFacts: [] })
  })

  it("serves a cache hit without spending a limit point, and limits misses to 30 a minute", async () => {
    for (let i = 0; i < 40; i++) expect((await get("cover")).status).toBe(200)
    expect(renderCardPng).toHaveBeenCalledTimes(1)

    const statuses: number[] = []
    for (let version = 1; version <= 30; version++) {
      prismaMock.rewindPrefs.findUnique.mockResolvedValue({
        id: "prefs-1", userId: "user-1", year: 2026, signed: false, includeArt: false, dailyDetail: false, cardFacts: null,
        notify: true, exclusionsVersion: version, createdAt: new Date(), updatedAt: new Date(),
      })
      statuses.push((await get("cover")).status)
    }
    expect(statuses.slice(0, 29).every((status) => status === 200)).toBe(true)
    expect(statuses[29]).toBe(429)
  })
})
