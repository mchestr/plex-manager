import "server-only"

/**
 * The hash that a review page shows and an approval sends back (E28, TS 10.3):
 * sort the keys, join them with a newline, SHA-256, lower-case hex. A
 * deletion batch passes one `{itemKey}|{action}|{importListExclusion}` string
 * per item (E35, `batchHash()` in lib/cleanup/run/batches.ts).
 *
 * Server-only (architecture-r2-4): loaders return the hash, and no client
 * code computes it.
 *
 * @module lib/cleanup/keys-hash
 */

import { createHash } from "node:crypto"

/** The lower-case hex SHA-256 of the sorted keys joined by "\n". The order of `keys` does not matter. */
export function keysHash(keys: readonly string[]): string {
  const sorted = [...keys].sort()
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex")
}
