/**
 * The settings Security section's read (P11.1): whether stored secrets are
 * encrypted, the primary kid, and the fields this process could not decrypt.
 * Never a key or a value.
 *
 * @module lib/data/encryption
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { isEncryptionConfigured, primaryKid } from "@/lib/security/crypto"
import { listUnreadable, type UnreadableField } from "@/lib/security/unreadable-secrets"

export interface EncryptionStatus {
  configured: boolean
  primaryKid: string | null
  unreadable: UnreadableField[]
}

export async function getEncryptionStatus(): Promise<EncryptionStatus> {
  await assertAdmin()
  return { configured: isEncryptionConfigured(), primaryKid: primaryKid(), unreadable: listUnreadable() }
}
