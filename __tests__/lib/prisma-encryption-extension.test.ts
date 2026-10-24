/**
 * @jest-environment node
 *
 * The encryption query extension (P11.1, SEC-32/34), with a fake `query`:
 * nested reads are decrypted, nested writes encrypted, and a field that does
 * not decrypt becomes null with one log line while the rest of the row reads.
 */

import crypto from "node:crypto"

import { encryptionQuery, withStoredSecrets } from "@/lib/db/encryption-extension"
import { encryptSecret } from "@/lib/security/crypto"
import { isUnreadable, listUnreadable, resetUnreadable } from "@/lib/security/unreadable-secrets"

const logError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: (...args: unknown[]) => logError(...args), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))

const K1 = crypto.randomBytes(32).toString("base64")
const K2 = crypto.randomBytes(32).toString("base64")

beforeEach(() => {
  process.env.ENCRYPTION_KEYS = `k1:${K1}`
  logError.mockClear()
  resetUnreadable()
})

afterAll(() => {
  delete process.env.ENCRYPTION_KEYS
})

/** Runs one operation through the extension against a fake database answer. */
async function run(model: string, operation: string, args: unknown, answer: unknown = null) {
  const query = jest.fn(async (_args: unknown) => answer)
  const result = await encryptionQuery({ model, operation, args, query })
  return { result, query }
}

describe("encryption extension: nested reads", () => {
  it("decrypts invite.usages[].user.plexAuthToken", async () => {
    const answer = {
      id: "inv-1",
      code: "ABC",
      usages: [
        { id: "u-1", user: { id: "user-1", plexAuthToken: encryptSecret("token-one") } },
        { id: "u-2", user: { id: "user-2", plexAuthToken: encryptSecret("token-two") } },
      ],
    }
    const { result } = await run("Invite", "findUnique", { where: { id: "inv-1" }, include: { usages: { include: { user: true } } } }, answer)

    expect(result).toMatchObject({
      usages: [{ user: { plexAuthToken: "token-one" } }, { user: { plexAuthToken: "token-two" } }],
    })
  })

  it("decrypts user.discordConnection.accessToken and LLMUsage text in a list", async () => {
    const answer = [
      {
        id: "user-1",
        plexAuthToken: encryptSecret("plex"),
        discordConnection: { id: "dc-1", accessToken: encryptSecret("access"), refreshToken: encryptSecret("refresh") },
        llmUsage: [{ id: "l-1", prompt: encryptSecret("a prompt"), response: "" }],
      },
    ]
    const { result } = await run("User", "findMany", {}, answer)

    expect(result).toEqual([
      {
        id: "user-1",
        plexAuthToken: "plex",
        discordConnection: { id: "dc-1", accessToken: "access", refreshToken: "refresh" },
        llmUsage: [{ id: "l-1", prompt: "a prompt", response: "" }],
      },
    ])
  })

  it("leaves count, aggregate and groupBy results alone", async () => {
    const answer = { _count: { prompt: 3 } }
    const { result } = await run("LLMUsage", "aggregate", { _count: { prompt: true } }, answer)
    expect(result).toEqual({ _count: { prompt: 3 } })
  })
})

describe("encryption extension: nested writes", () => {
  it("encrypts a nested create, createMany, connectOrCreate, update and upsert", async () => {
    const args = {
      data: {
        code: "ABC",
        usages: {
          create: { user: { create: { name: "Ada", plexAuthToken: "nested-token" } } },
        },
      },
    }
    const { query } = await run("Invite", "create", args)

    const sent = query.mock.calls[0][0] as typeof args
    const token = sent.data.usages.create.user.create.plexAuthToken
    expect(token.startsWith("enc:v2:k1:")).toBe(true)

    const userArgs = {
      where: { id: "user-1" },
      data: {
        discordConnection: {
          upsert: { create: { accessToken: "a1", refreshToken: "r1" }, update: { accessToken: { set: "a2" } } },
        },
        llmUsage: {
          createMany: { data: [{ prompt: "p1", response: "" }] },
          updateMany: { where: { id: "l-1" }, data: { response: "r2" } },
          update: [{ where: { id: "l-2" }, data: { prompt: "p3" } }],
        },
        inviteUsages: { connectOrCreate: [{ where: { id: "iu-1" }, create: { invite: { create: { code: "X" } } } }] },
      },
    }
    await run("User", "update", userArgs)
    const { discordConnection, llmUsage } = userArgs.data
    expect(discordConnection.upsert.create.accessToken).toMatch(/^enc:v2:k1:/)
    expect(discordConnection.upsert.create.refreshToken).toMatch(/^enc:v2:k1:/)
    expect(discordConnection.upsert.update.accessToken.set).toMatch(/^enc:v2:k1:/)
    expect(llmUsage.createMany.data[0].prompt).toMatch(/^enc:v2:k1:/)
    expect(llmUsage.createMany.data[0].response).toBe("")
    expect(llmUsage.updateMany.data.response).toMatch(/^enc:v2:k1:/)
    expect(llmUsage.update[0].data.prompt).toMatch(/^enc:v2:k1:/)
    expect(userArgs.where).toEqual({ id: "user-1" })
  })

  it("encrypts an upsert's top-level create and update", async () => {
    const args = { where: { id: "config" }, create: { id: "config", stripeSecretKey: "sk_1" }, update: { stripeSecretKey: "sk_2" } }
    await run("Config", "upsert", args)
    expect(args.create.stripeSecretKey).toMatch(/^enc:v2:k1:/)
    expect(args.update.stripeSecretKey).toMatch(/^enc:v2:k1:/)
  })
})

describe("encryption extension: fail soft", () => {
  it("nulls one bad field, decrypts the rest of the row and logs once", async () => {
    process.env.ENCRYPTION_KEYS = `k2:${K2}`
    const unreadable = (() => {
      process.env.ENCRYPTION_KEYS = `k1:${K1}`
      const value = encryptSecret("old-key")
      process.env.ENCRYPTION_KEYS = `k2:${K2}`
      return value
    })()
    const row = () => ({ id: "dc-1", accessToken: unreadable, refreshToken: encryptSecret("fresh") })

    const first = await run("DiscordConnection", "findUnique", {}, row())
    const second = await run("DiscordConnection", "findUnique", {}, row())

    expect(first.result).toEqual({ id: "dc-1", accessToken: null, refreshToken: "fresh" })
    expect(second.result).toEqual({ id: "dc-1", accessToken: null, refreshToken: "fresh" })
    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith("crypto.decrypt_failed", undefined, {
      model: "DiscordConnection",
      field: "accessToken",
      kid: "k1",
      code: "KEY_UNKNOWN",
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain(unreadable)
    expect(isUnreadable("DiscordConnection", "accessToken", "dc-1")).toBe(true)
    expect(listUnreadable()).toEqual([{ model: "DiscordConnection", field: "accessToken", kid: "k1", code: "KEY_UNKNOWN", rows: 1 }])

    // A re-entered value decrypts and clears the record
    await run("DiscordConnection", "findUnique", {}, { id: "dc-1", accessToken: encryptSecret("re-entered") })
    expect(isUnreadable("DiscordConnection", "accessToken", "dc-1")).toBe(false)
  })

  it("passes stored values through untouched inside withStoredSecrets", async () => {
    const stored = encryptSecret("raw")
    const args = { data: { plexAuthToken: "plain" } }
    const { result } = await withStoredSecrets(() => run("User", "update", args, { id: "u", plexAuthToken: stored }))
    expect(args.data.plexAuthToken).toBe("plain")
    expect(result).toEqual({ id: "u", plexAuthToken: stored })
  })
})
