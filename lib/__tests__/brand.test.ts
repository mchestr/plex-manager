/**
 * @jest-environment node
 *
 * The product strings (P3.9, ui-design-system 7.1): the server-name fallback
 * order through the real `getAppSettings()`, and the icon monogram.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig, buildPlexServer } from "@/__tests__/helpers/factories"
import { monogramFor, productName, rewindName, serverName } from "@/lib/brand"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }))
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: async () => "UTC" }))

beforeEach(() => mockReset(prismaMock))

const named = (name: string) => buildPlexServer({ name })

describe("serverName", () => {
  it("reads Config.serverName first", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ serverName: "Northfield Plex" }))
    prismaMock.plexServer.findFirst.mockResolvedValue(named("Basement"))

    await expect(serverName()).resolves.toBe("Northfield Plex")
  })

  it("then the active Plex server's name", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ serverName: null }))
    prismaMock.plexServer.findFirst.mockResolvedValue(named("Basement"))

    await expect(serverName()).resolves.toBe("Basement")
  })

  it("then the product name", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    prismaMock.plexServer.findFirst.mockResolvedValue(null)
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)

    await expect(serverName()).resolves.toBe(productName)
    expect(productName).toBe("Plex Manager")
  })

  it("falls back to the product name when the database is down", async () => {
    prismaMock.config.findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(serverName()).resolves.toBe("Plex Manager")
  })
})

describe("rewindName", () => {
  it("is '{server name} Rewind {year}'", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ serverName: "Northfield Plex" }))

    await expect(rewindName(2026)).resolves.toBe("Northfield Plex Rewind 2026")
  })
})

describe("monogramFor", () => {
  it.each([
    ["Northfield Plex", "N"],
    ["émile", "É"],
    // A decomposed é is the same grapheme.
    ["émile", "É"],
    ["  lowercase", "L"],
  ])("draws the first grapheme of %p", (name, letter) => {
    expect(monogramFor(name)).toBe(letter)
  })

  it("uppercases per locale", () => {
    expect(monogramFor("istanbul", "tr-TR")).toBe("İ")
  })

  it.each([
    ["東京サーバー", null],
    ["مكتبة الأفلام", null],
    ["🎬 Movie Night", "M"],
    ["東京 Plex", "P"],
  ])("falls back for %p, which the OG fonts cannot draw", (name, letter) => {
    expect(monogramFor(name)).toBe(letter)
  })
})
