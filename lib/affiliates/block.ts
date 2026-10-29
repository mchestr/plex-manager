/**
 * The affiliate block list: Plex accounts that affiliate invites refuse. Only
 * an HMAC-SHA256 of the Plex id is stored (`AffiliateBlock.plexIdHash`), keyed
 * by `Config.affiliateBlockKey`, so the list holds no Plex id. The first block
 * creates the key (32 random bytes as hex); until then nothing is blocked.
 * Blocks are kept until an admin unblocks them.
 *
 * @module lib/affiliates/block
 */

import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

/** The stored form of a Plex id: hex HMAC-SHA256 under the block key. */
function plexIdHash(key: string, plexUserId: string): string {
  return createHmac("sha256", key).update(plexUserId).digest("hex")
}

/** Whether affiliate invites refuse this Plex account. */
export async function isBlocked(plexUserId: string): Promise<boolean> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { affiliateBlockKey: true } })
  if (!config?.affiliateBlockKey) return false
  const block = await prisma.affiliateBlock.findUnique({
    where: { plexIdHash: plexIdHash(config.affiliateBlockKey, plexUserId) },
    select: { id: true },
  })
  return block !== null
}

/** The block key, created on first use; a concurrent first use keeps whichever key was written first. */
async function blockKey(tx: PrismaTransactionClient): Promise<string> {
  const current = await tx.config.findUnique({ where: { id: "config" }, select: { affiliateBlockKey: true } })
  if (current?.affiliateBlockKey) return current.affiliateBlockKey
  await tx.config.updateMany({ where: { id: "config", affiliateBlockKey: null }, data: { affiliateBlockKey: randomBytes(32).toString("hex") } })
  const created = await tx.config.findUnique({ where: { id: "config" }, select: { affiliateBlockKey: true } })
  if (!created?.affiliateBlockKey) throw new Error("The affiliate block key could not be created")
  return created.affiliateBlockKey
}

/**
 * Blocks the Plex account from affiliate invites, inside the caller's
 * transaction (member removal), and audits it there. Blocking an account
 * twice keeps the first row.
 */
export async function blockPlexAccount(tx: PrismaTransactionClient, plexUserId: string, actorId: string): Promise<void> {
  const hash = plexIdHash(await blockKey(tx), plexUserId)
  const block = await tx.affiliateBlock.upsert({
    where: { plexIdHash: hash },
    create: { plexIdHash: hash, createdBy: actorId },
    update: {},
    select: { id: true },
  })
  await recordAuditEvent(AuditEventType.AFFILIATE_ACCOUNT_BLOCKED, actorId, { blockId: block.id }, tx)
}
