/**
 * @jest-environment node
 *
 * The keyring in lib/security/crypto.ts (P11.1, SEC-32/33): v1 legacy values
 * still decrypt, v2 values round-trip per kid, failures are codes, and the
 * tag and payload lengths are enforced.
 */

import crypto from "node:crypto"

import {
  decryptSecret,
  encryptForPrimary,
  encryptSecret,
  isEncryptionConfigured,
  kidOf,
  needsReencryption,
  parseKeyringEntries,
  primaryKid,
  tryDecryptSecret,
} from "@/lib/security/crypto"

const LEGACY = "legacy-key-0123456789abcdef0123456789"
const K1 = crypto.randomBytes(32).toString("base64")
const K2 = crypto.randomBytes(32).toString("base64")

/** What the pre-P11.1 module wrote: `enc:v1:` with the SHA-256 of ENCRYPTION_KEY. */
function v1Encrypt(plaintext: string, raw = LEGACY): string {
  const key = crypto.createHash("sha256").update(raw, "utf8").digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`
}

function setKeys({ keys, legacy }: { keys?: string; legacy?: string }) {
  if (keys === undefined) delete process.env.ENCRYPTION_KEYS
  else process.env.ENCRYPTION_KEYS = keys
  if (legacy === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = legacy
}

afterEach(() => setKeys({}))

describe("crypto keyring", () => {
  it("decrypts v1 values written before the keyring", () => {
    const stored = v1Encrypt("plex-token")
    setKeys({ legacy: LEGACY })
    expect(tryDecryptSecret(stored)).toEqual({ ok: true, value: "plex-token" })
    setKeys({ keys: `k1:${K1}`, legacy: LEGACY })
    expect(decryptSecret(stored)).toBe("plex-token")
    expect(needsReencryption(stored)).toBe(true)
  })

  it("round-trips v2 values under the primary kid", () => {
    setKeys({ keys: `k1:${K1},k2:${K2}` })
    const stored = encryptSecret("sk_live_123")
    expect(stored.startsWith("enc:v2:k1:")).toBe(true)
    expect(kidOf(stored)).toBe("k1")
    expect(decryptSecret(stored)).toBe("sk_live_123")
    expect(needsReencryption(stored)).toBe(false)
    expect(encryptSecret(stored)).toBe(stored)
  })

  it("writes enc:v2:legacy: in production with only ENCRYPTION_KEY set", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    setKeys({ legacy: LEGACY })
    expect(isEncryptionConfigured()).toBe(true)
    expect(primaryKid()).toBe("legacy")
    const stored = encryptSecret("tautulli-key")
    expect(stored.startsWith("enc:v2:legacy:")).toBe(true)
    expect(decryptSecret(stored)).toBe("tautulli-key")
  })

  it("reads a value under a second kid and flags it for re-encryption", () => {
    setKeys({ keys: `k1:${K1}` })
    const underK1 = encryptSecret("x-secret")
    setKeys({ keys: `k2:${K2},k1:${K1}` })
    expect(decryptSecret(underK1)).toBe("x-secret")
    expect(needsReencryption(underK1)).toBe(true)
    expect(encryptForPrimary("x-secret").startsWith("enc:v2:k2:")).toBe(true)
  })

  it("answers KEY_UNKNOWN for a kid not in the keyring and KEY_MISSING with no key", () => {
    setKeys({ keys: `k1:${K1}` })
    const stored = encryptSecret("x")
    setKeys({ keys: `k2:${K2}` })
    expect(tryDecryptSecret(stored)).toEqual({ ok: false, code: "KEY_UNKNOWN", kid: "k1" })
    setKeys({})
    expect(tryDecryptSecret(stored)).toEqual({ ok: false, code: "KEY_MISSING", kid: "k1" })
  })

  it("answers CORRUPT for a wrong key, never throwing, and decryptSecret names no value", () => {
    setKeys({ keys: `k1:${K1}` })
    const stored = encryptSecret("the-secret-value")
    setKeys({ keys: `k1:${K2}` })
    expect(tryDecryptSecret(stored)).toEqual({ ok: false, code: "CORRUPT", kid: "k1" })
    expect(() => decryptSecret(stored)).toThrow("CORRUPT (kid k1)")
    expect(() => decryptSecret(stored)).not.toThrow(/the-secret-value/)
  })

  it("rejects a 12-byte tag and a payload shorter than 28 bytes", () => {
    setKeys({ keys: `k1:${K1}` })
    const key = Buffer.from(K1, "base64")
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 12 })
    const ciphertext = Buffer.concat([cipher.update("short-tag", "utf8"), cipher.final()])
    const shortTag = `enc:v2:k1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`
    expect(tryDecryptSecret(shortTag)).toMatchObject({ ok: false, code: "CORRUPT" })

    const short = `enc:v2:k1:${crypto.randomBytes(27).toString("base64")}`
    expect(tryDecryptSecret(short)).toEqual({ ok: false, code: "CORRUPT", kid: "k1" })
  })

  it("rejects a 31-byte keyring entry", () => {
    const short = crypto.randomBytes(31).toString("base64")
    expect(parseKeyringEntries(`k1:${short}`)).toEqual([{ kid: "k1", problem: "not_32_bytes" }])
    setKeys({ keys: `k1:${short}` })
    expect(isEncryptionConfigured()).toBe(false)
    expect(() => encryptSecret("x")).toThrow("ENCRYPTION_KEYS has no valid entry")
  })

  it("reports malformed, reserved and duplicate entries", () => {
    expect(parseKeyringEntries(`nokid,legacy:${K1},k1:${K1},k1:${K2},bad kid:${K1}`)).toEqual([
      { kid: "", problem: "malformed" },
      { kid: "legacy", problem: "reserved_kid" },
      { kid: "k1", problem: null },
      { kid: "k1", problem: "duplicate_kid" },
      { kid: "", problem: "bad_kid" },
    ])
  })

  it("passes empty strings and plaintext through", () => {
    setKeys({ keys: `k1:${K1}` })
    expect(encryptSecret("")).toBe("")
    expect(tryDecryptSecret("")).toEqual({ ok: true, value: "" })
    expect(tryDecryptSecret("plain")).toEqual({ ok: true, value: "plain" })
    expect(needsReencryption("")).toBe(false)
    expect(needsReencryption("plain")).toBe(true)
  })

  it("writes nothing encrypted without a key", () => {
    expect(isEncryptionConfigured()).toBe(false)
    expect(encryptSecret("plain")).toBe("plain")
    expect(needsReencryption("plain")).toBe(false)
  })

  it("matches its JSDoc examples", () => {
    const zero = Buffer.alloc(32).toString("base64")
    expect(parseKeyringEntries(`k1:${zero},k2:c2hvcnQ=`)).toEqual([
      { kid: "k1", problem: null },
      { kid: "k2", problem: "not_32_bytes" },
    ])
    setKeys({ keys: `k1:${K1}` })
    expect(tryDecryptSecret("plain")).toEqual({ ok: true, value: "plain" })
    expect(tryDecryptSecret("enc:v2:gone:AAAA")).toEqual({ ok: false, code: "KEY_UNKNOWN", kid: "gone" })
  })
})
