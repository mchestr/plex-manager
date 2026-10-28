/**
 * Application-layer encryption for secrets stored at rest, with a keyring.
 *
 * ## Overview
 *
 * External-service credentials, member Plex tokens, Discord tokens, the Stripe
 * secrets and the LLM prompt text (`ENCRYPTED_FIELDS` in `lib/prisma.ts`) are
 * encrypted with AES-256-GCM before they reach the database and decrypted on
 * read, so a dump or backup does not expose them.
 *
 * ## Keys (P11.1, SEC-32/33)
 *
 * - `ENCRYPTION_KEYS`: comma-separated `kid:base64` entries, each decoding to
 *   exactly 32 bytes (`openssl rand -base64 32`). The first valid entry is the
 *   primary key, which every new write uses. Kids are 1-32 letters, digits,
 *   `_` or `-`; `legacy` is reserved.
 * - `ENCRYPTION_KEY`: the legacy key, any string, hashed with SHA-256. It reads
 *   `enc:v1:` values and `enc:v2:legacy:` values. While `ENCRYPTION_KEYS` is
 *   unset it is also the primary key, under the kid `legacy`.
 *
 * ## Formats
 *
 * ```
 * enc:v1:<base64(iv | tag | ciphertext)>        legacy key, read only
 * enc:v2:<kid>:<base64(iv | tag | ciphertext)>  written by encryptSecret
 * anything else                                  plaintext, returned as is
 * ```
 *
 * The IV is 12 bytes and the tag 16 (`authTagLength: 16`, Node DEP0182); a
 * payload shorter than 28 bytes is corrupt. Empty strings are never
 * encrypted, so filters such as `response: { not: "" }` keep working.
 *
 * ## Errors
 *
 * {@link tryDecryptSecret} never throws: it returns `KEY_MISSING` (no key can
 * read the value), `KEY_UNKNOWN` (its kid is not in the keyring) or `CORRUPT`
 * (wrong key or damaged payload). {@link decryptSecret} throws, for scripts.
 * Neither ever puts a key or a value in an error or log line.
 *
 * @module
 */

import crypto from "crypto"

import { createLogger } from "@/lib/utils/logger"


const V1_PREFIX = "enc:v1:"
const V2_PREFIX = "enc:v2:"
const ENCRYPTED_PATTERN = /^enc:v\d+:/

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH = 16
const MIN_PAYLOAD_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH
const KEY_BYTES = 32

/** The implicit kid of `ENCRYPTION_KEY`. */
const LEGACY_KID = "legacy"

const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/** One `ENCRYPTION_KEYS` entry, read without its secret ever leaving this module. */
export interface KeyringEntry {
  kid: string
  /** Why the entry cannot be used, or null when it can. */
  problem: "malformed" | "bad_kid" | "reserved_kid" | "duplicate_kid" | "not_32_bytes" | null
}

interface Keyring {
  /** Valid `ENCRYPTION_KEYS` entries, in order. */
  ring: Map<string, Buffer>
  /** True when `ENCRYPTION_KEYS` was set, valid or not. */
  ringConfigured: boolean
  legacy: Buffer | null
  primary: { kid: string; key: Buffer } | null
}

/**
 * Reads `ENCRYPTION_KEYS` into entries and their problems. Never returns the
 * key material; `lib/env.ts` uses it for the boot check.
 *
 * @example
 * ```ts
 * parseKeyringEntries("k1:" + Buffer.alloc(32).toString("base64") + ",k2:c2hvcnQ=")
 * // [{ kid: "k1", problem: null }, { kid: "k2", problem: "not_32_bytes" }]
 * ```
 */
export function parseKeyringEntries(raw: string | undefined): KeyringEntry[] {
  return readEntries(raw).map(({ kid, problem }) => ({ kid, problem }))
}

function readEntries(raw: string | undefined): (KeyringEntry & { key: Buffer | null })[] {
  if (!raw?.trim()) return []
  const seen = new Set<string>()
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(":")
      if (colon <= 0) return { kid: "", problem: "malformed" as const, key: null }
      const kid = part.slice(0, colon)
      const encoded = part.slice(colon + 1)
      if (!KID_PATTERN.test(kid)) return { kid: "", problem: "bad_kid" as const, key: null }
      if (kid === LEGACY_KID) return { kid, problem: "reserved_kid" as const, key: null }
      if (seen.has(kid)) return { kid, problem: "duplicate_kid" as const, key: null }
      seen.add(kid)
      const key = /^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ? Buffer.from(encoded, "base64") : Buffer.alloc(0)
      if (key.length !== KEY_BYTES) return { kid, problem: "not_32_bytes" as const, key: null }
      return { kid, problem: null, key }
    })
}

let cached: { source: string; keyring: Keyring } | undefined
const warnedEntries = new Set<string>()

/** The keyring for the current environment, rebuilt only when the variables change. */
function getKeyring(): Keyring {
  const rawRing = process.env.ENCRYPTION_KEYS
  const rawLegacy = process.env.ENCRYPTION_KEY
  const source = `${rawRing ?? ""}\u0000${rawLegacy ?? ""}`
  if (cached?.source === source) return cached.keyring

  const ring = new Map<string, Buffer>()
  for (const entry of readEntries(rawRing)) {
    if (entry.key) {
      ring.set(entry.kid, entry.key)
    } else if (!warnedEntries.has(`${entry.kid}:${entry.problem}`)) {
      warnedEntries.add(`${entry.kid}:${entry.problem}`)
      // Created here, not at load: lib/env.ts imports this module before any logger is needed
      createLogger("CRYPTO").warn("crypto.keyring_entry_ignored", { kid: entry.kid || undefined, problem: entry.problem })
    }
  }
  const legacy = rawLegacy ? crypto.createHash("sha256").update(rawLegacy, "utf8").digest() : null
  const ringConfigured = Boolean(rawRing?.trim())
  const [first] = ring
  const primary = ringConfigured
    ? first
      ? { kid: first[0], key: first[1] }
      : null
    : legacy
      ? { kid: LEGACY_KID, key: legacy }
      : null

  const keyring = { ring, ringConfigured, legacy, primary }
  cached = { source, keyring }
  return keyring
}

/** True when a key is configured, so new writes are encrypted. */
export function isEncryptionConfigured(): boolean {
  return getKeyring().primary !== null
}

/** The kid new writes use, or null when no key is configured. */
export function primaryKid(): string | null {
  return getKeyring().primary?.kid ?? null
}

/** True for a value this module wrote (any version). */
function isEncrypted(value: string): boolean {
  return ENCRYPTED_PATTERN.test(value)
}

/**
 * The kid a stored value is under: `legacy` for `enc:v1:`, the v2 kid, or
 * null for plaintext and unknown formats.
 *
 * @internal
 */
export function kidOf(value: string): string | null {
  if (value.startsWith(V1_PREFIX)) return LEGACY_KID
  if (!value.startsWith(V2_PREFIX)) return null
  const rest = value.slice(V2_PREFIX.length)
  const colon = rest.indexOf(":")
  return colon > 0 ? rest.slice(0, colon) : null
}

/**
 * True when a stored value should be rewritten under the primary key: a
 * non-empty plaintext, or a value under another kid. False without a key.
 */
export function needsReencryption(value: string): boolean {
  const primary = primaryKid()
  if (!primary || value === "") return false
  if (!isEncrypted(value)) return true
  return value.startsWith(V1_PREFIX) || kidOf(value) !== primary
}

function seal(plaintext: string, kid: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  return `${V2_PREFIX}${kid}:${payload}`
}

/**
 * Encrypts a secret under the primary key as `enc:v2:<kid>:`. Returns the
 * value unchanged when it is empty, already encrypted (idempotent; rotation is
 * `lib/security/reencrypt.ts`'s job) or no key is configured.
 *
 * @throws Error when `ENCRYPTION_KEYS` is set but holds no valid entry, so a
 *   misconfigured keyring never silently writes plaintext
 */
export function encryptSecret(plaintext: string): string {
  return isEncrypted(plaintext) ? plaintext : encryptText(plaintext)
}

/**
 * Encrypts free text under the primary key, even text that looks like an
 * encrypted value: what a person typed or a model wrote then reads back
 * exactly as written, never as the secret it imitates. Returns the text
 * unchanged when it is empty or no key is configured.
 *
 * @throws Error when `ENCRYPTION_KEYS` is set but holds no valid entry
 */
export function encryptText(plaintext: string): string {
  if (plaintext === "") return plaintext
  const { primary, ringConfigured } = getKeyring()
  if (!primary) {
    if (ringConfigured) throw new Error("ENCRYPTION_KEYS has no valid entry; no secret can be written")
    return plaintext
  }
  return seal(plaintext, primary.kid, primary.key)
}

/**
 * Re-encrypts an already decrypted value under the primary key, whatever it
 * was stored under. Used by the re-encryption job and the boot canary.
 */
export function encryptForPrimary(plaintext: string): string {
  const { primary } = getKeyring()
  if (!primary || plaintext === "") return plaintext
  return seal(plaintext, primary.kid, primary.key)
}

export type DecryptFailureCode = "KEY_MISSING" | "KEY_UNKNOWN" | "CORRUPT"

export type DecryptResult =
  | { ok: true; value: string }
  | { ok: false; code: DecryptFailureCode; kid: string | null }

function keyFor(kid: string): Buffer | null {
  const { ring, legacy } = getKeyring()
  return ring.get(kid) ?? (kid === LEGACY_KID ? legacy : null)
}

/**
 * Decrypts a stored value. Plaintext comes back unchanged. Never throws.
 *
 * @example
 * ```ts
 * tryDecryptSecret("plain") // { ok: true, value: "plain" }
 * tryDecryptSecret("enc:v2:gone:AAAA") // { ok: false, code: "KEY_UNKNOWN", kid: "gone" } (with a keyring set)
 * ```
 */
export function tryDecryptSecret(value: string): DecryptResult {
  if (!isEncrypted(value)) return { ok: true, value }
  const kid = kidOf(value)
  if (kid === null) return { ok: false, code: "CORRUPT", kid: null }

  const key = keyFor(kid)
  if (!key) {
    const { ring, legacy } = getKeyring()
    return { ok: false, code: ring.size === 0 && !legacy ? "KEY_MISSING" : "KEY_UNKNOWN", kid }
  }

  const encoded = value.startsWith(V1_PREFIX) ? value.slice(V1_PREFIX.length) : value.slice(V2_PREFIX.length + kid.length + 1)
  const payload = Buffer.from(encoded, "base64")
  if (payload.length < MIN_PAYLOAD_LENGTH) return { ok: false, code: "CORRUPT", kid }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, payload.subarray(0, IV_LENGTH), {
      authTagLength: AUTH_TAG_LENGTH,
    })
    decipher.setAuthTag(payload.subarray(IV_LENGTH, MIN_PAYLOAD_LENGTH))
    const plaintext = Buffer.concat([decipher.update(payload.subarray(MIN_PAYLOAD_LENGTH)), decipher.final()])
    return { ok: true, value: plaintext.toString("utf8") }
  } catch {
    return { ok: false, code: "CORRUPT", kid }
  }
}

/**
 * Decrypts a stored value, throwing when it cannot (for scripts). The message
 * names the code and kid, never the value.
 *
 * @internal
 */
export function decryptSecret(value: string): string {
  const result = tryDecryptSecret(value)
  if (result.ok) return result.value
  throw new Error(`Cannot decrypt a stored secret: ${result.code}${result.kid ? ` (kid ${result.kid})` : ""}`)
}

/** The plaintext the boot canary (`Config.encryptionCanary`) encrypts. */
export const CANARY_PLAINTEXT = "plex-manager-encryption-canary"
