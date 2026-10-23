/**
 * @jest-environment node
 *
 * reencryptSecrets (P11.1): dry-run counts, an apply and a second apply that
 * changes nothing, rotation from k1 to k2, and unreadable values left alone.
 * The Prisma delegates are backed by an in-memory table per model.
 */

import crypto from "node:crypto"
import { mockReset } from "jest-mock-extended"

import { delegateMock, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"
import { CANARY_PLAINTEXT, decryptSecret, encryptSecret, kidOf } from "@/lib/security/crypto"
import { encryptedFieldsHash, reencryptMarker, reencryptSecrets } from "@/lib/security/reencrypt"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

type Row = Record<string, unknown> & { id: string }

const K1 = crypto.randomBytes(32).toString("base64")
const K2 = crypto.randomBytes(32).toString("base64")
const K3 = crypto.randomBytes(32).toString("base64")

let tables: Record<string, Row[]>
let configUpserts: Record<string, unknown>[]

const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1)

function backDelegates() {
  tables = Object.fromEntries(Object.keys(ENCRYPTED_FIELDS).map((model) => [model, []]))
  configUpserts = []
  for (const model of Object.keys(ENCRYPTED_FIELDS)) {
    const delegate = delegateMock(delegateName(model))
    delegate.findMany.mockImplementation(async ({ take, cursor }: { take: number; cursor?: { id: string } }) => {
      const rows = [...tables[model]].sort((a, b) => a.id.localeCompare(b.id))
      const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0
      return rows.slice(start, start + take).map((row) => ({ ...row }))
    })
    delegate.updateMany.mockImplementation(async ({ where, data }: { where: Row; data: Record<string, unknown> }) => {
      const [field] = Object.keys(data)
      const row = tables[model].find((candidate) => candidate.id === where.id && candidate[field] === where[field])
      if (row) Object.assign(row, data)
      return { count: row ? 1 : 0 }
    })
  }
  prismaMock.$transaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]))
  delegateMock("config").upsert.mockImplementation(async (args: { update: Record<string, unknown> }) => {
    configUpserts.push(args.update)
    return {}
  })
}

function setKeys(keys: string) {
  process.env.ENCRYPTION_KEYS = keys
}

beforeEach(() => {
  mockReset(prismaMock)
  backDelegates()
  setKeys(`k1:${K1}`)
})

afterAll(() => {
  delete process.env.ENCRYPTION_KEYS
})

describe("reencryptSecrets", () => {
  it("does nothing without a key", async () => {
    delete process.env.ENCRYPTION_KEYS
    await expect(reencryptSecrets({ dryRun: true })).resolves.toEqual({ ok: false, code: "NO_KEY" })
  })

  it("counts in a dry run without writing, then applies once and finds nothing the second time", async () => {
    tables.Tautulli.push({ id: "t1", apiKey: "plain-tautulli" })
    tables.User.push({ id: "u1", plexAuthToken: "plain-plex" }, { id: "u2", plexAuthToken: null }, { id: "u3", plexAuthToken: encryptSecret("enc") })
    tables.LLMUsage.push({ id: "l1", prompt: "a prompt", response: "" })

    const dry = await reencryptSecrets({ dryRun: true, batchSize: 2 })
    expect(dry).toMatchObject({ ok: true, dryRun: true, primaryKid: "k1", totals: { values: 4, plaintext: 3, otherKid: 0, rewritten: 0 } })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(configUpserts).toEqual([])
    expect(tables.Tautulli[0].apiKey).toBe("plain-tautulli")

    const applied = await reencryptSecrets({ dryRun: false, batchSize: 2 })
    expect(applied).toMatchObject({ ok: true, totals: { plaintext: 3, rewritten: 3 } })
    expect(decryptSecret(tables.Tautulli[0].apiKey as string)).toBe("plain-tautulli")
    expect(kidOf(tables.User[0].plexAuthToken as string)).toBe("k1")
    expect(tables.LLMUsage[0].response).toBe("")
    expect(configUpserts).toHaveLength(1)
    expect(configUpserts[0].encryptionFieldsHash).toBe(`k1:${encryptedFieldsHash()}`)
    expect(decryptSecret(configUpserts[0].encryptionCanary as string)).toBe(CANARY_PLAINTEXT)

    const before = JSON.stringify(tables)
    const again = await reencryptSecrets({ dryRun: false, batchSize: 2 })
    expect(again).toMatchObject({ ok: true, totals: { values: 4, plaintext: 0, otherKid: 0, rewritten: 0 } })
    expect(JSON.stringify(tables)).toBe(before)
  })

  it("rotates from k1 to k2, after which k1 can be removed", async () => {
    tables.Config.push({ id: "config", stripeSecretKey: encryptSecret("sk_live"), stripeWebhookSecret: null, rewindSerialKey: encryptSecret("serial") })
    setKeys(`k2:${K2},k1:${K1}`)

    const result = await reencryptSecrets({ dryRun: false })
    expect(result).toMatchObject({ ok: true, primaryKid: "k2", totals: { otherKid: 2, rewritten: 2 } })
    expect(kidOf(tables.Config[0].stripeSecretKey as string)).toBe("k2")
    expect(kidOf(configUpserts[0].encryptionCanary as string)).toBe("k2")
    expect(configUpserts[0].encryptionFieldsHash).toBe(reencryptMarker("k2"))

    setKeys(`k2:${K2}`)
    expect(decryptSecret(tables.Config[0].stripeSecretKey as string)).toBe("sk_live")
    expect(decryptSecret(tables.Config[0].rewindSerialKey as string)).toBe("serial")
  })

  it("counts values no key reads as unreadable and never rewrites them", async () => {
    setKeys(`k3:${K3}`)
    const lost = encryptSecret("lost")
    setKeys(`k1:${K1}`)
    tables.Overseerr.push({ id: "o1", apiKey: lost })

    const result = await reencryptSecrets({ dryRun: false })
    expect(result).toMatchObject({ ok: true, fields: { "Overseerr.apiKey": { unreadable: 1, rewritten: 0 } } })
    expect(tables.Overseerr[0].apiKey).toBe(lost)
  })

  it("skips a value that changed after it was read", async () => {
    tables.Radarr.push({ id: "r1", apiKey: "old-plain" })
    const radarr = delegateMock("radarr")
    const original = radarr.findMany.getMockImplementation()
    radarr.findMany.mockImplementationOnce(async (args: unknown) => {
      const rows = await original?.(args)
      tables.Radarr[0].apiKey = encryptSecret("new-from-settings")
      return rows
    })

    await reencryptSecrets({ dryRun: false })
    expect(decryptSecret(tables.Radarr[0].apiKey as string)).toBe("new-from-settings")
  })

  it("stops between batches when the signal aborts and records no run", async () => {
    tables.Sonarr.push({ id: "s1", apiKey: "plain" })
    const controller = new AbortController()
    controller.abort()

    const result = await reencryptSecrets({ dryRun: false, signal: controller.signal })
    expect(result).toMatchObject({ ok: true, aborted: true })
    expect(configUpserts).toEqual([])
  })
})
