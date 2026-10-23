/**
 * @jest-environment node
 *
 * SECRETS_REENCRYPT (P11.1): boot queues it once per primary kid and field
 * list, deduplicated on `secrets:reencrypt:<kid>:<fields hash>`.
 */

import crypto from "node:crypto"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { addJob } from "@/lib/queue/client"
import { enqueueSecretsReencrypt, getSecretsProcessor } from "@/lib/queue/jobs/secrets"
import { JOB_TYPES } from "@/lib/queue/types"
import { reencryptMarker, reencryptSecrets } from "@/lib/security/reencrypt"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/security/reencrypt", () => ({
  ...jest.requireActual("@/lib/security/reencrypt"),
  reencryptSecrets: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env.ENCRYPTION_KEYS = `k1:${crypto.randomBytes(32).toString("base64")}`
})

afterAll(() => {
  delete process.env.ENCRYPTION_KEYS
})

describe("enqueueSecretsReencrypt", () => {
  it("queues the job with a deduplication id when no run finished under this kid", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ encryptionFieldsHash: null }))

    await expect(enqueueSecretsReencrypt()).resolves.toBe("queued")
    expect(addJob).toHaveBeenCalledWith(
      JOB_TYPES.SECRETS_REENCRYPT,
      { triggeredBy: "scheduled" },
      { attempts: 3, deduplication: { id: `secrets:reencrypt:${reencryptMarker("k1")}` } }
    )
  })

  it("queues nothing once a run finished under this kid and field list", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ encryptionFieldsHash: reencryptMarker("k1") }))
    await expect(enqueueSecretsReencrypt()).resolves.toBe("current")
    expect(addJob).not.toHaveBeenCalled()
  })

  it("queues again after a rotation", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ encryptionFieldsHash: reencryptMarker("k0") }))
    await expect(enqueueSecretsReencrypt()).resolves.toBe("queued")
  })

  it("does nothing without a key", async () => {
    delete process.env.ENCRYPTION_KEYS
    await expect(enqueueSecretsReencrypt()).resolves.toBe("no-key")
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })
})

describe("getSecretsProcessor", () => {
  it("runs a full re-encryption for SECRETS_REENCRYPT only", async () => {
    expect(getSecretsProcessor(JOB_TYPES.RETENTION_SWEEP)).toBeNull()
    const processor = getSecretsProcessor(JOB_TYPES.SECRETS_REENCRYPT)
    await processor?.({} as never)
    expect(reencryptSecrets).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }))
  })
})
