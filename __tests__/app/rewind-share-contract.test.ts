/**
 * @jest-environment node
 *
 * The share contract (design 6.1, 6.7, P7.5): a link that publishes only
 * page 05 (Top shows) of the heavy fixture. Its page HTML, its metadata and
 * its OG card carry no archetype name, no `time.totalHours` display and no
 * percentile, and no key matches P5.10's forbidden-key pattern.
 */

import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { GET as getCard } from "@/app/api/rewind/card/s/[assetKey]/[page]/route"
import SharedRewindPage, { generateMetadata } from "@/app/rewind/s/[token]/page"
import { OgCard } from "@/lib/rewind/cards/og"
import { renderCardPng } from "@/lib/rewind/cards/render"
import { getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import { fixtureRewind } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

jest.mock("next/headers", () => ({ headers: jest.fn(async () => new Headers()) }))
jest.mock("next/server", () => ({ ...jest.requireActual("next/server"), after: jest.fn() }))
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  useRouter: () => ({ refresh: jest.fn() }),
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn().mockResolvedValue(null) }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-US" }),
}))
jest.mock("@/lib/env", () => ({ ...jest.requireActual("@/lib/env"), getBaseUrl: () => "https://plex.example.com" }))
jest.mock("@/lib/rewind/cards/render", () => ({ renderCardPng: jest.fn(async () => Buffer.from("png")) }))
jest.mock("@/actions/rewind-sharing", () => ({ rotateRewindShare: jest.fn(), disableRewindShare: jest.fn() }))
jest.mock("@/actions/wrapped-share-link", () => ({ disableWrappedShareLink: jest.fn() }))

const TOKEN = "Kf-qkQFsJ4E6X_vMSKq1PiT624JyrVJtTNbepCgWYl8"
const ASSET_KEY = "Abcdefghijklmnopqrstuv"

const FORBIDDEN_SEGMENT =
  /^(leaderboards?|emails?|\w*Email|userId|plexUserId|tautulli\w*|player|location|ip|ipAddress|ip_address|machineId|machine_id|dedication)$/i

/** Every key path of a JSON value, as its segments. */
function keyPaths(value: unknown, prefix: string[] = []): string[][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keyPaths(item, [...prefix, String(i)]))
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const path = [...prefix, ...key.split(".")]
      return [path, ...keyPaths(child, path)]
    })
  }
  return []
}

/** Every string a card's host tree prints. */
function texts(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return []
  if (typeof node === "string" || typeof node === "number") return [String(node)]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<{ children?: ReactNode }>
  if (typeof element.type === "function") return texts((element.type as (props: unknown) => ReactNode)(element.props))
  return texts(element.props.children)
}

let heavy: RewindDataV3
let banned: string[]
let cacheDir: string

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
  const archetype = heavy.archetype ? getArchetype(heavy.archetype.id) : null
  banned = [
    archetype?.name,
    heavy.facts["time.totalHours"]?.display,
    heavy.facts["standing.percentile"]?.display,
  ].filter((value): value is string => Boolean(value))
})

afterAll(() => {
  delete process.env.REWIND_CACHE_DIR
  rmSync(cacheDir, { recursive: true, force: true })
})

beforeEach(() => {
  cacheDir ??= mkdtempSync(path.join(os.tmpdir(), "rewind-share-contract-"))
  process.env.REWIND_CACHE_DIR = cacheDir
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "UTC" }))
  prismaMock.rewindShare.findUnique.mockResolvedValue({
    ...buildRewindShare({ id: "share-1", assetKey: ASSET_KEY, pages: ["top-shows"], cardFacts: [] }),
    wrapped: buildPlexWrapped({ id: "wrapped-1", userId: "owner-1", data: JSON.stringify(heavy), dataVersion: 3 }),
  } as never)
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

function expectClean(surface: string, text: string) {
  for (const value of banned) expect({ surface, leaked: text.includes(value) ? value : null }).toEqual({ surface, leaked: null })
  expect(text).not.toMatch(/\btop \d+%/i)
}

it("has something to leak: the heavy fixture carries an archetype, total hours and a percentile", () => {
  expect(banned).toHaveLength(3)
})

it("keeps them out of the page HTML", async () => {
  const page = (await SharedRewindPage({ params: Promise.resolve({ token: TOKEN }) })) as ReactElement
  const html = renderToStaticMarkup(page)

  expect(html).toContain(`/api/rewind/card/s/${ASSET_KEY}/top-shows`)
  expect(html).not.toContain(`/api/rewind/card/s/${ASSET_KEY}/centrefold`)
  expect(html).not.toContain("data-archetype")
  expectClean("page", html)
})

it("keeps them out of the metadata", async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ token: TOKEN }) })
  const json = JSON.stringify(metadata)

  expect(json).toContain(`/api/rewind/card/s/${ASSET_KEY}/top-shows?size=og`)
  expectClean("metadata", json)
  expect(keyPaths(metadata).filter((path) => path.some((segment) => FORBIDDEN_SEGMENT.test(segment)))).toEqual([])
})

it("keeps them out of the OG card's input and its printed text", async () => {
  const response = await getCard(new Request(`http://localhost/api/rewind/card/s/${ASSET_KEY}/top-shows?size=og`), {
    params: Promise.resolve({ assetKey: ASSET_KEY, page: "top-shows" }),
  })
  expect(response.status).toBe(200)

  const input = jest.mocked(renderCardPng).mock.calls.at(-1)?.[0] as CardInput
  expect(input).toMatchObject({ size: "og", page: { type: "top-shows", archetype: null, stats: [] } })
  expectClean("og input", JSON.stringify(input))
  expectClean("og text", texts(createElement(() => OgCard(input))).join(" "))
  expect(keyPaths(input).filter((path) => path.some((segment) => FORBIDDEN_SEGMENT.test(segment)))).toEqual([])
})
