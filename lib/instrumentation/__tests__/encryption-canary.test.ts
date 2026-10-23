/**
 * @jest-environment node
 *
 * The boot key check (P11.1): a mismatched key exits with 1 and prints no
 * secret, a missing canary is written under the primary key, and a database
 * that does not answer is retried later without exiting.
 */

import crypto from "node:crypto"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { CANARY_RETRY_MS, CANARY_TIMEOUT_MS, assertEncryptionKey } from "@/lib/instrumentation/encryption-canary"
import { CANARY_PLAINTEXT, decryptSecret, encryptForPrimary } from "@/lib/security/crypto"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
const log = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: (...args: unknown[]) => log.error(...args),
    warn: (...args: unknown[]) => log.warn(...args),
    info: (...args: unknown[]) => log.info(...args),
    debug: jest.fn(),
  }),
}))

const K1 = crypto.randomBytes(32).toString("base64")
const K2 = crypto.randomBytes(32).toString("base64")

let exit: jest.SpiedFunction<typeof process.exit>

beforeEach(() => {
  mockReset(prismaMock)
  Object.values(log).forEach((fn) => fn.mockClear())
  exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never)
  process.env.ENCRYPTION_KEYS = `k1:${K1}`
})

afterEach(() => {
  exit.mockRestore()
  jest.useRealTimers()
  delete process.env.ENCRYPTION_KEYS
})

function storeCanary(value: string | null) {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ encryptionCanary: value }))
}

describe("assertEncryptionKey", () => {
  it("passes when the canary decrypts", async () => {
    storeCanary(encryptForPrimary(CANARY_PLAINTEXT))
    await assertEncryptionKey()
    expect(exit).not.toHaveBeenCalled()
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("exits with 1 on a wrong key, logging the kid and never a secret", async () => {
    const canary = encryptForPrimary(CANARY_PLAINTEXT)
    storeCanary(canary)
    process.env.ENCRYPTION_KEYS = `k1:${K2}`

    await assertEncryptionKey()

    expect(exit).toHaveBeenCalledWith(1)
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("crypto.key_mismatch"), undefined, { kid: "k1", code: "CORRUPT" })
    const logged = JSON.stringify(log.error.mock.calls)
    for (const secret of [K1, K2, canary, CANARY_PLAINTEXT]) expect(logged).not.toContain(secret)
  })

  it("exits with 1 when the canary's kid is not in the keyring", async () => {
    storeCanary(encryptForPrimary(CANARY_PLAINTEXT))
    process.env.ENCRYPTION_KEYS = `k2:${K2}`

    await assertEncryptionKey()

    expect(exit).toHaveBeenCalledWith(1)
    expect(log.error).toHaveBeenCalledWith(expect.any(String), undefined, { kid: "k1", code: "KEY_UNKNOWN" })
  })

  it("writes a missing canary under the primary key", async () => {
    storeCanary(null)
    await assertEncryptionKey()

    expect(exit).not.toHaveBeenCalled()
    const [args] = prismaMock.config.upsert.mock.calls[0]
    const written = (args.update as { encryptionCanary: string }).encryptionCanary
    expect(written.startsWith("enc:v2:k1:")).toBe(true)
    expect(decryptSecret(written)).toBe(CANARY_PLAINTEXT)
  })

  it("writes nothing without a key", async () => {
    delete process.env.ENCRYPTION_KEYS
    storeCanary(null)
    await assertEncryptionKey()
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })

  it("never exits on a database timeout, and retries later", async () => {
    jest.useFakeTimers()
    prismaMock.config.findUnique.mockReturnValueOnce(new Promise(() => {}) as never)

    const first = assertEncryptionKey()
    await jest.advanceTimersByTimeAsync(CANARY_TIMEOUT_MS)
    await first

    expect(exit).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("crypto.canary_unchecked"), { error: "TimeoutError" })

    storeCanary(null)
    await jest.advanceTimersByTimeAsync(CANARY_RETRY_MS)
    expect(prismaMock.config.upsert).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })

  it("does not retry once shutdown has begun", async () => {
    jest.useFakeTimers()
    prismaMock.config.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED"))
    const controller = new AbortController()
    controller.abort()

    await assertEncryptionKey({ signal: controller.signal })
    await jest.advanceTimersByTimeAsync(CANARY_RETRY_MS * 2)

    expect(prismaMock.config.findUnique).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })
})
