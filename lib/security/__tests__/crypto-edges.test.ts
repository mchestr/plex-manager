/**
 * @jest-environment node
 *
 * Edge cases of the keyring and the unreadable-secrets record (P11.22):
 * a key that is not base64, a malformed v2 value, re-encryption without a
 * key, a decrypt error without a kid, and rows read without their id.
 */

import crypto from "node:crypto"

import { decryptSecret, encryptForPrimary, encryptSecret, encryptText, kidOf, parseKeyringEntries, tryDecryptSecret } from "@/lib/security/crypto"
import { clearUnreadable, isUnreadable, listUnreadable, markUnreadable, resetUnreadable } from "@/lib/security/unreadable-secrets"
import { createLogger } from "@/lib/utils/logger"

jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})

const logger = createLogger("CRYPTO")
const K1 = crypto.randomBytes(32).toString("base64")

function setKeys(keys?: string) {
  delete process.env.ENCRYPTION_KEY
  if (keys === undefined) delete process.env.ENCRYPTION_KEYS
  else process.env.ENCRYPTION_KEYS = keys
}

afterEach(() => {
  setKeys()
  resetUnreadable()
})

describe("free text", () => {
  it("seals text that looks encrypted, which encryptSecret keeps as it is", () => {
    setKeys(`k1:${K1}`)
    const lookalike = encryptSecret("secret")

    expect(encryptSecret(lookalike)).toBe(lookalike)
    const sealed = encryptText(lookalike)
    expect(sealed).not.toBe(lookalike)
    expect(tryDecryptSecret(sealed)).toEqual({ ok: true, value: lookalike })
  })

  it("keeps empty text, and any text without a key", () => {
    expect(encryptText("hello")).toBe("hello")
    setKeys(`k1:${K1}`)
    expect(encryptText("")).toBe("")
  })
})

describe("keyring edges", () => {
  it("reads a key that is not base64 as the wrong length", () => {
    expect(parseKeyringEntries("k1:not*base64")).toEqual([{ kid: "k1", problem: "not_32_bytes" }])
  })

  it("ignores a bad entry with one warning however often the ring is read", () => {
    setKeys(`k1:${K1},k2:short`)
    const sealed = encryptForPrimary("secret")

    setKeys(`k1:${K1},k2:short `)
    expect(tryDecryptSecret(sealed)).toEqual({ ok: true, value: "secret" })
    expect(jest.mocked(logger.warn).mock.calls).toEqual([["crypto.keyring_entry_ignored", { kid: "k2", problem: "not_32_bytes" }]])
  })

  it("reads a v2 value without a kid separator as corrupt", () => {
    setKeys(`k1:${K1}`)

    expect(kidOf("enc:v2:nocolon")).toBeNull()
    expect(tryDecryptSecret("enc:v2:nocolon")).toEqual({ ok: false, code: "CORRUPT", kid: null })
    expect(() => decryptSecret("enc:v2:nocolon")).toThrow("Cannot decrypt a stored secret: CORRUPT")
    expect(() => decryptSecret("enc:v2:nocolon")).not.toThrow("(kid")
  })

  it("leaves a value as it is without a key, and the empty string always", () => {
    expect(encryptForPrimary("secret")).toBe("secret")

    setKeys(`k1:${K1}`)
    expect(encryptForPrimary("")).toBe("")
  })
})

describe("unreadable secrets", () => {
  it("records a row read without its id, and counts it as one row", () => {
    markUnreadable("PlexServer", "token", undefined, "k0", "KEY_UNKNOWN")

    expect(isUnreadable("PlexServer", "token", undefined)).toBe(true)
    expect(listUnreadable()).toEqual([{ model: "PlexServer", field: "token", kid: "k0", code: "KEY_UNKNOWN", rows: 1 }])
  })

  it("keeps the field listed until its last row clears", () => {
    markUnreadable("Sonarr", "apiKey", "r1", "k0", "KEY_UNKNOWN")
    markUnreadable("Sonarr", "apiKey", "r2", "k0", "KEY_UNKNOWN")

    clearUnreadable("Sonarr", "apiKey", "r1")
    expect(listUnreadable()).toEqual([expect.objectContaining({ rows: 1 })])
    expect(isUnreadable("Sonarr", "apiKey", "r1")).toBe(false)

    clearUnreadable("Sonarr", "apiKey", "r2")
    expect(listUnreadable()).toEqual([])
  })

  it("does nothing for a field it never recorded", () => {
    clearUnreadable("Radarr", "apiKey", undefined)

    expect(isUnreadable("Radarr", "apiKey", "r1")).toBe(false)
    expect(listUnreadable()).toEqual([])
  })
})
