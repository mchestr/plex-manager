/**
 * Re-encrypts stored secrets under the primary key (P11.1, SEC-33/34).
 *
 * ## Overview
 *
 * {@link reencryptSecrets} walks every `ENCRYPTED_FIELDS` model in id-cursor
 * batches of {@link REENCRYPT_BATCH_SIZE}, with the encryption extension off
 * (`withStoredSecrets`), and rewrites each value that is plaintext or under
 * another kid (`needsReencryption`). Each batch is one `$transaction` of
 * conditional updates (`where: { id, [field]: <stored value> }`), so a value
 * changed since it was read is left alone. A value no key can read is
 * counted as unreadable and never touched.
 *
 * A full run (not a dry run, not aborted) also rewrites the boot canary under
 * the primary key and records `Config.encryptionFieldsHash` as
 * {@link reencryptMarker}, which boot compares to decide whether to queue
 * `SECRETS_REENCRYPT`. A second run finds nothing to do.
 *
 * Rotation: add the new kid first in `ENCRYPTION_KEYS`, run this, then remove
 * the old kid (`docs/operations.md`, "Encryption keys").
 *
 * @module
 */

import "server-only"

import { createHash } from "node:crypto"

import { ENCRYPTED_FIELDS } from "@/lib/db/encrypted-fields"
import { withStoredSecrets } from "@/lib/db/encryption-extension"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  CANARY_PLAINTEXT,
  encryptForPrimary,
  needsReencryption,
  primaryKid,
  tryDecryptSecret,
} from "@/lib/security/crypto"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REENCRYPT")

/** Rows per select and transaction. @internal */
export const REENCRYPT_BATCH_SIZE = 200

interface FieldCounts {
  /** Non-empty values read. */
  values: number
  plaintext: number
  /** Encrypted under a kid other than the primary (or as `enc:v1:`). */
  otherKid: number
  /** Encrypted under a kid no configured key reads. */
  unreadable: number
  /** Values rewritten (always 0 in a dry run). */
  rewritten: number
}

export type ReencryptResult =
  | { ok: false; code: "NO_KEY" }
  | {
      ok: true
      dryRun: boolean
      primaryKid: string
      /** `Model.field` to its counts. */
      fields: Record<string, FieldCounts>
      totals: FieldCounts
      aborted: boolean
    }

type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>
  updateMany(args: unknown): Prisma.PrismaPromise<unknown>
}

const delegateOf = (model: string) => (prisma as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)]

const emptyCounts = (): FieldCounts => ({ values: 0, plaintext: 0, otherKid: 0, unreadable: 0, rewritten: 0 })

/** A short hash of `ENCRYPTED_FIELDS`, so adding a column queues a new run. @internal */
export function encryptedFieldsHash(): string {
  const canonical = Object.keys(ENCRYPTED_FIELDS)
    .sort()
    .map((model) => `${model}:${[...ENCRYPTED_FIELDS[model]].sort().join(",")}`)
    .join(";")
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16)
}

/** `<kid>:<fields hash>`: what a finished run records, and the job's deduplication key. */
export function reencryptMarker(kid: string): string {
  return `${kid}:${encryptedFieldsHash()}`
}

async function reencryptModel(
  model: string,
  fields: readonly string[],
  options: { dryRun: boolean; signal?: AbortSignal; batchSize: number },
  counts: Record<string, FieldCounts>
): Promise<boolean> {
  const delegate = delegateOf(model)
  const select = Object.fromEntries([["id", true], ...fields.map((field) => [field, true])])
  let cursor: string | undefined

  for (;;) {
    if (options.signal?.aborted) return false
    const rows = await delegate.findMany({
      select,
      orderBy: { id: "asc" },
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (rows.length === 0) return true
    cursor = rows[rows.length - 1].id as string

    const updates: Prisma.PrismaPromise<unknown>[] = []
    for (const row of rows) {
      for (const field of fields) {
        const stored = row[field]
        if (typeof stored !== "string" || stored === "") continue
        const count = (counts[`${model}.${field}`] ??= emptyCounts())
        count.values++
        if (!needsReencryption(stored)) continue
        const plain = tryDecryptSecret(stored)
        if (!plain.ok) {
          count.unreadable++
          continue
        }
        if (plain.value === stored) count.plaintext++
        else count.otherKid++
        if (options.dryRun) continue
        updates.push(delegate.updateMany({ where: { id: row.id, [field]: stored }, data: { [field]: encryptForPrimary(plain.value) } }))
        count.rewritten++
      }
    }
    if (updates.length > 0) await prisma.$transaction(updates)
    if (rows.length < options.batchSize) return true
  }
}

/** Rewrites the boot canary under the primary key and records the finished run. */
async function recordRun(kid: string): Promise<void> {
  await prisma.config.upsert({
    where: { id: "config" },
    create: { id: "config", encryptionCanary: encryptForPrimary(CANARY_PLAINTEXT), encryptionFieldsHash: reencryptMarker(kid) },
    update: { encryptionCanary: encryptForPrimary(CANARY_PLAINTEXT), encryptionFieldsHash: reencryptMarker(kid) },
  })
}

/**
 * Counts (dry run) or rewrites every stored secret that is plaintext or under
 * an old kid. Idempotent; stops between batches when `signal` aborts.
 */
export async function reencryptSecrets({
  dryRun,
  signal,
  batchSize = REENCRYPT_BATCH_SIZE,
}: {
  dryRun: boolean
  signal?: AbortSignal
  batchSize?: number
}): Promise<ReencryptResult> {
  const kid = primaryKid()
  if (!kid) return { ok: false, code: "NO_KEY" }

  return withStoredSecrets(async () => {
    const fields: Record<string, FieldCounts> = {}
    let aborted = false
    for (const [model, columns] of Object.entries(ENCRYPTED_FIELDS)) {
      if (!(await reencryptModel(model, columns, { dryRun, signal, batchSize }, fields))) {
        aborted = true
        break
      }
    }

    const totals = emptyCounts()
    for (const count of Object.values(fields)) {
      for (const key of Object.keys(totals) as (keyof FieldCounts)[]) totals[key] += count[key]
    }
    if (!dryRun && !aborted) await recordRun(kid)
    if (!dryRun) logger.info("secrets.reencrypted", { kid, rewritten: totals.rewritten, unreadable: totals.unreadable, aborted })
    return { ok: true, dryRun, primaryKid: kid, fields, totals, aborted }
  })
}
