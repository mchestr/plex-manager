/**
 * @jest-environment node
 */

/**
 * `reencryptSecrets` on PostgreSQL (P11.1): plaintext rows are encrypted
 * under k1, a second run changes nothing, a rotation moves them to k2, and
 * after k1 is removed the extension still reads them, nested reads included.
 *
 * The client is the app's (the pg adapter plus the encryption extension).
 * Gated by `describePg` and run only by `npm run test:integration`; the
 * suite asserts on its own rows only, deletes them afterwards, and restores
 * the `Config` columns it writes.
 */

import { randomBytes, randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { encryptionQuery } from "@/lib/db/encryption-extension"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { kidOf } from "@/lib/security/crypto"
import { reencryptSecrets } from "@/lib/security/reencrypt"
import { describePg } from "@/test/helpers/integration"

const createClient = (databaseUrl: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }).$extends({
    query: { $allModels: { $allOperations: encryptionQuery } },
  })

let mockDb: ReturnType<typeof createClient>
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `p111-${randomUUID().slice(0, 8)}`
const K1 = randomBytes(32).toString("base64")
const K2 = randomBytes(32).toString("base64")

describePg("reencryptSecrets on PostgreSQL", (databaseUrl) => {
  let raw: PrismaClient
  let savedConfig: { encryptionCanary: string | null; encryptionFieldsHash: string | null } | null

  const stored = async () => {
    const [tautulli, user] = await Promise.all([
      raw.tautulli.findUniqueOrThrow({ where: { id: `${RUN}-t` }, select: { apiKey: true } }),
      raw.user.findUniqueOrThrow({ where: { id: `${RUN}-u` }, select: { plexAuthToken: true } }),
    ])
    return { apiKey: tautulli.apiKey, plexAuthToken: user.plexAuthToken ?? "" }
  }

  beforeAll(async () => {
    raw = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    mockDb = createClient(databaseUrl)
    savedConfig = await raw.config.findUnique({ where: { id: "config" }, select: { encryptionCanary: true, encryptionFieldsHash: true } })
    await raw.tautulli.create({ data: { id: `${RUN}-t`, name: RUN, url: "http://tautulli.lan:8181", apiKey: "plain-tautulli-key", isActive: false } })
    await raw.user.create({ data: { id: `${RUN}-u`, name: RUN, plexAuthToken: "plain-plex-token" } })
    await raw.invite.create({ data: { id: `${RUN}-i`, code: RUN, usages: { create: { userId: `${RUN}-u` } } } })
  })

  afterAll(async () => {
    delete process.env.ENCRYPTION_KEYS
    await raw.invite.deleteMany({ where: { id: `${RUN}-i` } })
    await raw.user.deleteMany({ where: { id: `${RUN}-u` } })
    await raw.tautulli.deleteMany({ where: { id: `${RUN}-t` } })
    if (savedConfig) await raw.config.update({ where: { id: "config" }, data: savedConfig })
    else await raw.config.deleteMany({ where: { id: "config" } })
    await Promise.all([raw.$disconnect(), mockDb.$disconnect()])
  })

  it("counts plaintext in a dry run and writes nothing", async () => {
    process.env.ENCRYPTION_KEYS = `k1:${K1}`
    const result = await reencryptSecrets({ dryRun: true })

    expect(result).toMatchObject({ ok: true, dryRun: true, primaryKid: "k1" })
    if (!result.ok) return
    expect(result.fields["Tautulli.apiKey"].plaintext).toBeGreaterThanOrEqual(1)
    expect(result.fields["User.plexAuthToken"].plaintext).toBeGreaterThanOrEqual(1)
    await expect(stored()).resolves.toEqual({ apiKey: "plain-tautulli-key", plexAuthToken: "plain-plex-token" })
  })

  it("encrypts under k1, and a second run changes nothing", async () => {
    await reencryptSecrets({ dryRun: false })
    const first = await stored()
    expect(kidOf(first.apiKey)).toBe("k1")
    expect(kidOf(first.plexAuthToken)).toBe("k1")

    await reencryptSecrets({ dryRun: false })
    await expect(stored()).resolves.toEqual(first)

    const config = await raw.config.findUniqueOrThrow({ where: { id: "config" }, select: { encryptionCanary: true, encryptionFieldsHash: true } })
    expect(kidOf(config.encryptionCanary ?? "")).toBe("k1")
    expect(config.encryptionFieldsHash).toMatch(/^k1:[0-9a-f]{16}$/)
  })

  it("rotates to k2, and the app still reads every value once k1 is gone", async () => {
    process.env.ENCRYPTION_KEYS = `k2:${K2},k1:${K1}`
    await reencryptSecrets({ dryRun: false })
    const after = await stored()
    expect(kidOf(after.apiKey)).toBe("k2")
    expect(kidOf(after.plexAuthToken)).toBe("k2")

    process.env.ENCRYPTION_KEYS = `k2:${K2}`
    const tautulli = await mockDb.tautulli.findUniqueOrThrow({ where: { id: `${RUN}-t` } })
    expect(tautulli.apiKey).toBe("plain-tautulli-key")
    const invite = await mockDb.invite.findUniqueOrThrow({ where: { id: `${RUN}-i` }, include: { usages: { include: { user: true } } } })
    expect(invite.usages[0].user.plexAuthToken).toBe("plain-plex-token")
  })
})
