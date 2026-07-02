/**
 * Application-layer encryption for secrets stored at rest.
 *
 * ## Overview
 *
 * External-service credentials (Plex/Jellyfin/Tautulli/Overseerr/Sonarr/Radarr/
 * LLM keys, per-user Plex tokens, Discord OAuth tokens) are high-value: they
 * grant admin access to the connected services. This module encrypts them with
 * AES-256-GCM before they hit the database and decrypts them on read, so a DB
 * dump or backup leak does not directly expose the credentials.
 *
 * ## Backward compatibility
 *
 * Rollout is non-destructive — there is intentionally no migration that rewrites
 * existing rows:
 *
 * - {@link decryptSecret} returns already-plaintext (legacy) values unchanged
 *   and only decrypts values carrying the {@link ENCRYPTION_PREFIX} marker.
 * - {@link encryptSecret} is a no-op when `ENCRYPTION_KEY` is unset, so the app
 *   runs unencrypted in development without configuration.
 * - Existing plaintext rows get transparently encrypted the next time they are
 *   written (see the Prisma query extension in `lib/prisma.ts`).
 *
 * ## Configuration
 *
 * Set `ENCRYPTION_KEY` to a high-entropy secret (e.g. `openssl rand -hex 32`).
 * A 32-byte AES key is derived from it via SHA-256, so any sufficiently random
 * string works. Do NOT reuse `NEXTAUTH_SECRET` — a dedicated key keeps the two
 * concerns independent.
 *
 * @module
 */

import crypto from "crypto"

/**
 * Marker prepended to ciphertext so {@link decryptSecret} can distinguish
 * encrypted values from legacy plaintext. `v1` allows future format changes.
 */
export const ENCRYPTION_PREFIX = "enc:v1:"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96-bit nonce, the recommended size for GCM
const AUTH_TAG_LENGTH = 16

let cachedKey: Buffer | null | undefined

/**
 * Derives (and caches) the 32-byte AES key from `ENCRYPTION_KEY`, or returns
 * null when the env var is unset (encryption disabled).
 * @internal
 */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) {
    return cachedKey
  }
  const raw = process.env.ENCRYPTION_KEY
  cachedKey = raw ? crypto.createHash("sha256").update(raw, "utf8").digest() : null
  return cachedKey
}

/**
 * Returns true if a value is already encrypted by this module.
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX)
}

/**
 * Whether at-rest encryption is configured (ENCRYPTION_KEY is set).
 */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null
}

/**
 * Encrypts a plaintext secret. Returns the value unchanged when encryption is
 * not configured, or when the value is already encrypted (idempotent).
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  if (!key || isEncrypted(plaintext)) {
    return plaintext
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  const payload = Buffer.concat([iv, authTag, ciphertext]).toString("base64")
  return `${ENCRYPTION_PREFIX}${payload}`
}

/**
 * Decrypts a value produced by {@link encryptSecret}. Legacy plaintext (no
 * marker) is returned unchanged. If a value is marked encrypted but the key is
 * missing or the payload is corrupt, this throws — surfacing a real
 * misconfiguration rather than silently returning garbage.
 */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) {
    return value
  }

  const key = getKey()
  if (!key) {
    throw new Error(
      "Encountered an encrypted secret but ENCRYPTION_KEY is not set. " +
        "Set ENCRYPTION_KEY to the value used when the secret was written."
    )
  }

  const payload = Buffer.from(value.slice(ENCRYPTION_PREFIX.length), "base64")
  const iv = payload.subarray(0, IV_LENGTH)
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}
