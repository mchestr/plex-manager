/**
 * @jest-environment node
 *
 * The owner route and the share route draw the same card for the same page
 * and options (design 6.1, D4): the same input, one cache file, and
 * byte-identical PNGs through the installed next/og. `@vercel/og` loads WASM
 * that Jest cannot import, so the PNGs render in a child process through
 * `scripts/rewind-render-cards.tsx`.
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET as ownerGET } from "@/app/api/rewind/card/[rewindId]/[page]/route"
import { GET as shareGET } from "@/app/api/rewind/card/s/[assetKey]/[page]/route"
import { hasEntitlement } from "@/lib/actions/entitlement"
import { renderCardPng } from "@/lib/rewind/cards/render"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

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

const ROOT = path.resolve(__dirname, "../../../..")
const ASSET_KEY = "Abcdefghijklmnopqrstuv"

let heavy: RewindDataV3
let dir: string

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(renderCardPng).mockClear()
  dir = mkdtempSync(path.join(os.tmpdir(), "rewind-pair-cards-"))
  process.env.REWIND_CACHE_DIR = dir
  const wrapped = buildPlexWrapped({ id: "wrapped-1", userId: "owner-1", data: JSON.stringify(heavy), dataVersion: 3 })
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "owner-1", isAdmin: false }, expires: "2099-01-01" })
  jest.mocked(hasEntitlement).mockResolvedValue(true)
  prismaMock.plexWrapped.findFirst.mockResolvedValue(wrapped)
  const share = {
    ...buildRewindShare({ assetKey: ASSET_KEY, pages: ["cover", "top-shows", "clock"], signed: true, dailyDetail: true, cardFacts: ["hours.peak"] }),
    wrapped,
  }
  prismaMock.rewindShare.findUnique.mockResolvedValue(share)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(dir, { recursive: true, force: true })
})

const owner = () =>
  ownerGET(new NextRequest("http://localhost/api/rewind/card/wrapped-1/cover?signed=1&daily=1&facts=hours.peak"), {
    params: Promise.resolve({ rewindId: "wrapped-1", page: "cover" }),
  })
const link = () =>
  shareGET(new Request(`http://localhost/api/rewind/card/s/${ASSET_KEY}/cover`), { params: Promise.resolve({ assetKey: ASSET_KEY, page: "cover" }) })

it("renders once for both routes: the link is served from the owner's cache file", async () => {
  const fromOwner = Buffer.from(await (await owner()).arrayBuffer())
  const fromLink = Buffer.from(await (await link()).arrayBuffer())
  expect(fromLink.equals(fromOwner)).toBe(true)
  expect(renderCardPng).toHaveBeenCalledTimes(1)
  expect(readdirSync(path.join(dir, "cards"))).toHaveLength(1)
})

it("returns byte-identical PNGs through next/og", async () => {
  await owner()
  rmSync(path.join(dir, "cards"), { recursive: true, force: true })
  await link()
  const [ownerInput, linkInput] = jest.mocked(renderCardPng).mock.calls.map(([input]) => input)
  expect(linkInput).toEqual(ownerInput)

  const inputs: CardInput[] = [ownerInput, linkInput]
  const file = path.join(dir, "inputs.json")
  writeFileSync(file, JSON.stringify(inputs))
  const child = spawnSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["--conditions=react-server", "scripts/rewind-render-cards.tsx", file],
    { cwd: ROOT, encoding: "utf8", timeout: 90_000 }
  )
  if (child.status !== 0) throw new Error(`render failed:\n${child.stderr}`)
  const [a, b] = JSON.parse(child.stdout.trim().split("\n").pop() ?? "[]") as Array<{ bytes: number; sha256: string }>
  expect(a.bytes).toBeGreaterThan(1000)
  expect(b.sha256).toBe(a.sha256)
}, 120_000)
