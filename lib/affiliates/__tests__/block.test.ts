/** `isBlocked`: a keyed hash lookup, and nothing blocked before a key exists. */

import { createHmac } from "node:crypto"

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig } from "@/__tests__/helpers/factories"
import { isBlocked } from "@/lib/affiliates/block"
import type { AffiliateBlock } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

describe("isBlocked", () => {
  it("looks up the HMAC of the Plex id under the block key, never the id itself", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateBlockKey: "block-key" }))
    prismaMock.affiliateBlock.findUnique.mockResolvedValue({ id: "block-1" } as AffiliateBlock)

    await expect(isBlocked("12345")).resolves.toBe(true)
    const hash = createHmac("sha256", "block-key").update("12345").digest("hex")
    expect(prismaMock.affiliateBlock.findUnique).toHaveBeenCalledWith({ where: { plexIdHash: hash }, select: { id: true } })
  })

  it("is false when no block matches", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateBlockKey: "block-key" }))
    prismaMock.affiliateBlock.findUnique.mockResolvedValue(null)
    await expect(isBlocked("12345")).resolves.toBe(false)
  })

  it("is false without a key, without a lookup", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateBlockKey: null }))
    await expect(isBlocked("12345")).resolves.toBe(false)
    expect(prismaMock.affiliateBlock.findUnique).not.toHaveBeenCalled()
  })
})
