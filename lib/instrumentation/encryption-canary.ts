/**
 * The boot key check (P11.1, SEC-32): `Config.encryptionCanary` holds a known
 * value encrypted under the primary key, and boot checks that it decrypts.
 *
 * | Canary | Outcome |
 * |---|---|
 * | decrypts | nothing |
 * | does not decrypt (wrong, unknown or missing key) | `crypto.key_mismatch` with the kid and code, exit 1 |
 * | missing, with a key configured | written under the primary key |
 * | missing, no key | nothing to check |
 * | database slow or down | logged, retried later, never exits |
 *
 * The check is bounded at {@link CANARY_TIMEOUT_MS}; the retry runs in the
 * background until it gets an answer or shutdown begins. The re-encryption
 * job rewrites the canary under a new primary key once every value has moved.
 *
 * @module
 */

import { CANARY_PLAINTEXT, encryptForPrimary, isEncryptionConfigured, tryDecryptSecret } from "@/lib/security/crypto"
import { createLogger } from "@/lib/utils/logger"
import { withTimeout } from "@/lib/utils/with-timeout"

const logger = createLogger("CRYPTO")

/** @internal */
export const CANARY_TIMEOUT_MS = 5000
/** @internal */
export const CANARY_RETRY_MS = 30_000

type CanaryOutcome = "ok" | "written" | "no-key" | "mismatch"

async function checkCanary(): Promise<CanaryOutcome> {
  const { prisma } = await import("@/lib/prisma")
  const row = await prisma.config.findUnique({ where: { id: "config" }, select: { encryptionCanary: true } })
  const canary = row?.encryptionCanary
  if (!canary) {
    if (!isEncryptionConfigured()) return "no-key"
    const encryptionCanary = encryptForPrimary(CANARY_PLAINTEXT)
    await prisma.config.upsert({
      where: { id: "config" },
      create: { id: "config", encryptionCanary },
      update: { encryptionCanary },
    })
    return "written"
  }
  const result = tryDecryptSecret(canary)
  if (result.ok && result.value === CANARY_PLAINTEXT) return "ok"
  logger.error("crypto.key_mismatch: the stored secrets cannot be read with this encryption key", undefined, {
    kid: result.ok ? null : result.kid,
    code: result.ok ? "CORRUPT" : result.code,
  })
  return "mismatch"
}

/**
 * Runs the canary check, exiting with 1 on a mismatched key. A database that
 * does not answer within the timeout is retried every {@link CANARY_RETRY_MS}
 * in the background until `signal` aborts.
 */
export async function assertEncryptionKey({ signal }: { signal?: AbortSignal } = {}): Promise<void> {
  let outcome: CanaryOutcome
  try {
    outcome = await withTimeout(checkCanary(), CANARY_TIMEOUT_MS, "Checking the encryption canary")
  } catch (error) {
    logger.warn("crypto.canary_unchecked: the database did not answer; retrying", {
      error: error instanceof Error ? error.name : "unknown",
    })
    if (!signal?.aborted) {
      setTimeout(() => void assertEncryptionKey({ signal }), CANARY_RETRY_MS).unref()
    }
    return
  }
  if (outcome === "mismatch") process.exit(1)
  if (outcome === "written") logger.info("crypto.canary_written")
}
