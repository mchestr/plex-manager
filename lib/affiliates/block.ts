/**
 * The affiliate block list: Plex accounts that affiliate invites refuse. Only
 * an HMAC-SHA256 of the Plex id is stored (`AffiliateBlock.plexIdHash`), keyed
 * by `Config.affiliateBlockKey`, so the list holds no Plex id. Until the first
 * block creates the key, nothing can be blocked.
 *
 * @module lib/affiliates/block
 */

import "server-only"

import { createHmac } from "node:crypto"

import { prisma } from "@/lib/prisma"

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
