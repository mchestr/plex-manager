/**
 * @jest-environment node
 *
 * The preview card route (P7.10): admins only, noindex always, and a dry
 * run's card equals the owner route's card for the same data.
 */

import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { buildConfig, buildPlexWrapped } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET as ownerGET } from "@/app/api/rewind/card/[rewindId]/[page]/route"
import { GET } from "@/app/api/rewind/card/preview/[previewId]/[page]/route"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { renderCardPng } from "@/lib/rewind/cards/render"
import type { StoredDryRun } from "@/lib/rewind/dry-run/store"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

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
const mockGet = jest.fn()
jest.mock("@/lib/queue/connection", () => ({ readyWithin: async () => true, getRequestPathRedis: () => ({ get: mockGet }) }))

const ID = "0b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"
const MEMBER = "member-7"

let heavy: RewindDataV3
let dir: string
let admins = 0

const signIn = (id: string, isAdmin: boolean) =>
  jest.mocked(getServerSession).mockResolvedValue({ user: { id, isAdmin }, expires: "2099-01-01" } as never)

function freshCache() {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-preview-cards-"))
  process.env.REWIND_CACHE_DIR = dir
}

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(renderCardPng).mockClear()
  freshCache()
  // A fresh admin per test, so the in-memory limiter starts empty
  signIn(`admin-${++admins}`, true)
  const stored: StoredDryRun = {
    status: "completed",
    subject: { kind: "member", userId: MEMBER },
    year: 2026,
    adminId: "admin-1",
    finishedAt: "2026-11-20T10:00:00.000Z",
    data: heavy,
    trail: {},
  }
  mockGet.mockReset().mockImplementation(async (key: string) => (key === `rw:preview:${ID}` ? JSON.stringify(stored) : null))
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function get(page: string, query = "", previewId = ID) {
  return GET(new NextRequest(`http://localhost/api/rewind/card/preview/${previewId}/${page}${query}`), {
    params: Promise.resolve({ previewId, page }),
  })
}

describe("GET /api/rewind/card/preview/[previewId]/[page]", () => {
  it("renders an admin the dry run's card, never stored by a cache, with noindex", async () => {
    const response = await get("centrefold")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/png")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
  })

  it.each([
    ["a member", () => signIn(MEMBER, false)],
    ["a signed-out caller", () => jest.mocked(getServerSession).mockResolvedValue(null)],
  ])("is a 404 with noindex for %s, without reading the preview", async (_name, arrange) => {
    arrange()
    const response = await get("cover")
    expect(response.status).toBe(404)
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
    expect(mockGet).not.toHaveBeenCalled()
    expect(renderCardPng).not.toHaveBeenCalled()
  })

  it.each([
    ["an expired id", "cover", "1b6c1f7e-3c1a-4f7e-9d0a-2f4b8c6d1e3a"],
    ["a malformed id", "cover", "../x"],
    ["an unknown page", "nope", ID],
  ])("is a 404 for %s", async (_name, page, previewId) => {
    const response = await get(page, "", previewId)
    expect(response.status).toBe(404)
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex")
  })

  it("draws the same card as the owner route for the same data", async () => {
    const preview = Buffer.from(await (await get("centrefold")).arrayBuffer())

    freshCache()
    signIn(MEMBER, false)
    prismaMock.plexWrapped.findFirst.mockResolvedValue(buildPlexWrapped({ id: "wrapped-1", userId: MEMBER, data: JSON.stringify(heavy), dataVersion: 3 }))
    const owner = await ownerGET(new NextRequest("http://localhost/api/rewind/card/wrapped-1/centrefold"), {
      params: Promise.resolve({ rewindId: "wrapped-1", page: "centrefold" }),
    })
    expect(owner.status).toBe(200)
    expect(Buffer.from(await owner.arrayBuffer()).equals(preview)).toBe(true)
    expect(renderCardPng).toHaveBeenCalledTimes(2)
  })
})
