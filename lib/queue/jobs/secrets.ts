/**
 * `SECRETS_REENCRYPT` (P11.1): rewrites stored plaintext and values under an
 * old kid with the primary key (`lib/security/reencrypt.ts`). Boot queues it
 * once Redis answers, unless `Config.encryptionFieldsHash` already records a
 * finished run under the current kid and `ENCRYPTED_FIELDS`. The deduplication
 * id `secrets:reencrypt:<kid>:<fields hash>` keeps one job however many
 * processes start. Without Redis, boot runs the same pass in its own process
 * ({@link reencryptSecretsWithoutQueue}).
 *
 * @module
 */

import type { Job } from "bullmq"

import { shutdownSignal } from "@/lib/instrumentation/shutdown"
import { prisma } from "@/lib/prisma"
import { primaryKid } from "@/lib/security/crypto"
import { reencryptMarker, reencryptSecrets } from "@/lib/security/reencrypt"
import { createLogger } from "@/lib/utils/logger"

import { addJob } from "../client"
import { JOB_TYPES } from "../types"

const logger = createLogger("REENCRYPT")

/** This kid's marker when the last finished run is not under it and the field list; null when it is. */
async function dueMarker(kid: string): Promise<string | null> {
  const marker = reencryptMarker(kid)
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { encryptionFieldsHash: true } })
  return config?.encryptionFieldsHash === marker ? null : marker
}

/** Queues the re-encryption when the last finished run is not under this kid and field list. */
export async function enqueueSecretsReencrypt(): Promise<"queued" | "current" | "no-key"> {
  const kid = primaryKid()
  if (!kid) return "no-key"
  const marker = await dueMarker(kid)
  if (!marker) return "current"
  await addJob(JOB_TYPES.SECRETS_REENCRYPT, { triggeredBy: "scheduled" }, { attempts: 3, deduplication: { id: `secrets:reencrypt:${marker}` } })
  logger.info("secrets.reencrypt_queued", { kid })
  return "queued"
}

/**
 * The same check for a process without Redis, which runs the re-encryption
 * itself. A second process running it at the same time is harmless: each
 * value is rewritten only while it still holds what was read.
 */
export async function reencryptSecretsWithoutQueue(): Promise<"ran" | "current" | "no-key"> {
  const kid = primaryKid()
  if (!kid) return "no-key"
  if (!(await dueMarker(kid))) return "current"
  await reencryptSecrets({ dryRun: false, signal: shutdownSignal })
  return "ran"
}

export function getSecretsProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.SECRETS_REENCRYPT ? () => reencryptSecrets({ dryRun: false, signal: shutdownSignal }) : null
}
