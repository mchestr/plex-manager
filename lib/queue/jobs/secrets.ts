/**
 * `SECRETS_REENCRYPT` (P11.1): rewrites stored plaintext and values under an
 * old kid with the primary key (`lib/security/reencrypt.ts`). Boot queues it
 * once Redis answers, unless `Config.encryptionFieldsHash` already records a
 * finished run under the current kid and `ENCRYPTED_FIELDS`. The deduplication
 * id `secrets:reencrypt:<kid>:<fields hash>` keeps one job however many
 * processes start. Installs without Redis use the settings button instead.
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

/** Queues the re-encryption when the last finished run is not under this kid and field list. */
export async function enqueueSecretsReencrypt(): Promise<"queued" | "current" | "no-key"> {
  const kid = primaryKid()
  if (!kid) return "no-key"
  const marker = reencryptMarker(kid)
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { encryptionFieldsHash: true } })
  if (config?.encryptionFieldsHash === marker) return "current"
  await addJob(JOB_TYPES.SECRETS_REENCRYPT, { triggeredBy: "scheduled" }, { attempts: 3, deduplication: { id: `secrets:reencrypt:${marker}` } })
  logger.info("secrets.reencrypt_queued", { kid })
  return "queued"
}

export function getSecretsProcessor(jobType: string): ((job: Job) => Promise<unknown>) | null {
  return jobType === JOB_TYPES.SECRETS_REENCRYPT ? () => reencryptSecrets({ dryRun: false, signal: shutdownSignal }) : null
}
