import { createHash } from "node:crypto"

/**
 * A finding's key within its conversation: hex sha256 of
 * `type|tool|messageId`, structured fields only, because the judge words the
 * same problem differently on each run. Messages never change, so the key is
 * stable for the conversation's lifetime.
 */
export function fingerprintOf(f: { type: string; tool?: string | null; messageId: string }): string {
  return createHash("sha256").update(`${f.type}|${f.tool ?? ""}|${f.messageId}`).digest("hex")
}
