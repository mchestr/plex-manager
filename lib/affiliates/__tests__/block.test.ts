/** `isBlocked` and `blockPlexAccount`: a keyed hash, and a key made on the first block. */

import { createHmac } from "node:crypto"

import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig } from "@/__tests__/helpers/factories"
import { blockPlexAccount, isBlocked } from "@/lib/affiliates/block"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import type { AffiliateBlock } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))

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

describe("blockPlexAccount", () => {
  const tx = asAppTransactionClient(prismaMock)

  beforeEach(() => {
    jest.mocked(recordAuditEvent).mockClear()
    prismaMock.affiliateBlock.upsert.mockResolvedValue({ id: "block-1" } as AffiliateBlock)
  })

  it("stores the HMAC of the Plex id under the existing key, and audits the block id", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateBlockKey: "block-key" }))

    await blockPlexAccount(tx, "12345", "admin-1")
    const hash = createHmac("sha256", "block-key").update("12345").digest("hex")
    expect(prismaMock.config.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.affiliateBlock.upsert).toHaveBeenCalledWith({
      where: { plexIdHash: hash },
      create: { plexIdHash: hash, createdBy: "admin-1" },
      update: {},
      select: { id: true },
    })
    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.AFFILIATE_ACCOUNT_BLOCKED, "admin-1", { blockId: "block-1" }, tx)
  })

  it("creates the key once, only where none is set, then reads back whichever key won", async () => {
    prismaMock.config.findUnique
      .mockResolvedValueOnce(buildConfig({ affiliateBlockKey: null }))
      .mockResolvedValueOnce(buildConfig({ affiliateBlockKey: "winner" }))

    await blockPlexAccount(tx, "12345", "admin-1")
    expect(prismaMock.config.updateMany).toHaveBeenCalledWith({
      where: { id: "config", affiliateBlockKey: null },
      data: { affiliateBlockKey: expect.stringMatching(/^[0-9a-f]{64}$/) },
    })
    const hash = createHmac("sha256", "winner").update("12345").digest("hex")
    expect(prismaMock.affiliateBlock.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { plexIdHash: hash } }))
  })

  it("throws when the key cannot be created, so the removal rolls back", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    await expect(blockPlexAccount(tx, "12345", "admin-1")).rejects.toThrow("block key")
    expect(prismaMock.affiliateBlock.upsert).not.toHaveBeenCalled()
  })
})
