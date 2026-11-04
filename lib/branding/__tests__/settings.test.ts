/**
 * @jest-environment node
 */

/** getBranding: one Config read gives the subtitle, the accent and each image's versioned URL. */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getBranding, parseBrandAssetVersions } from "@/lib/branding/settings"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const SHA = "c".repeat(64)

beforeEach(() => mockReset(prismaMock))

it("reads the subtitle, accent and image URLs from Config alone", async () => {
  prismaMock.config.findUnique.mockResolvedValue(
    buildConfig({ loginSubtitle: "Hi", accentColor: "#E4202B", brandAssetVersions: { icon: SHA } })
  )
  await expect(getBranding()).resolves.toEqual({
    loginSubtitle: "Hi",
    accentColor: "#E4202B",
    assets: { icon: `/api/branding/icon/${SHA.slice(0, 16)}` },
  })
  expect(prismaMock.brandAsset.findMany).not.toHaveBeenCalled()
})

it("falls back to no branding when the database fails", async () => {
  prismaMock.config.findUnique.mockRejectedValue(new Error("down"))
  await expect(getBranding()).resolves.toEqual({ loginSubtitle: null, accentColor: null, assets: {} })
})

describe("parseBrandAssetVersions", () => {
  it("keeps known slots with a full hash", () => {
    expect(parseBrandAssetVersions({ wordmark: SHA, banner: SHA })).toEqual({ wordmark: SHA })
  })

  it("reads anything malformed as no images", () => {
    expect(parseBrandAssetVersions(null)).toEqual({})
    expect(parseBrandAssetVersions({ icon: "short" })).toEqual({})
    expect(parseBrandAssetVersions("nope")).toEqual({})
  })
})
