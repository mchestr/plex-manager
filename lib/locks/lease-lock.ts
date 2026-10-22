/**
 * One named lease, held by at most one process at a time.
 *
 * The Discord bot and the watchlist sync fallback each run in one process only:
 * whichever process holds the lease for their name. A {@link LeaseLock} keeps
 * the "am I the holder?" flag; a {@link LeaseStore} keeps the lease itself.
 * {@link PrismaLeaseStore} keeps one `LeaseLock` row per name.
 *
 * ## Special cases
 *
 * For one release, {@link PrismaLeaseStore} also refuses a name while the
 * legacy `DiscordBotLock` or `WatchlistSyncLock` row for it is live and owned
 * by another instance, so an old and a new container overlapping in a deploy
 * never both run the bot. P11.3 removes that check and drops both tables.
 *
 * @module
 */

import { randomBytes } from "crypto"

import type { PrismaClient } from "@/lib/generated/prisma/client"
import { prisma as defaultPrisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("LEASE_LOCK")

/** The background roles that run under a lease. */
export type LeaseName = "discord-bot" | "watchlist-sync"

/** How long an acquired or renewed lease stays valid (30 seconds). @internal */
export const DEFAULT_LEASE_DURATION_MS = 30 * 1000

/** One lease write: who takes it, now, and until when. */
export interface LeaseClaim {
  name: LeaseName
  instanceId: string
  now: Date
  expiresAt: Date
}

/** Where leases live. Each call reports whether `instanceId` holds the lease afterwards. */
export interface LeaseStore {
  /** Takes the lease if it is free, lapsed or already ours. */
  acquire(claim: LeaseClaim): Promise<boolean>
  /** Extends the lease only while it is ours and live. */
  renew(claim: LeaseClaim): Promise<boolean>
  /** Gives the lease up if it is ours. */
  release(name: LeaseName, instanceId: string): Promise<void>
}

type LeasePrisma = Pick<PrismaClient, "$transaction" | "leaseLock" | "discordBotLock" | "watchlistSyncLock">
type LeaseTx = Pick<PrismaClient, "leaseLock" | "discordBotLock" | "watchlistSyncLock">

/**
 * The live legacy row for `name` owned by someone else, if any. Removed with
 * the legacy tables in P11.3.
 */
async function legacyHolder(tx: LeaseTx, name: LeaseName, instanceId: string, now: Date): Promise<boolean> {
  const where = { id: name }
  const row =
    name === "discord-bot"
      ? await tx.discordBotLock.findUnique({ where })
      : await tx.watchlistSyncLock.findUnique({ where })
  return row !== null && row.expiresAt > now && row.instanceId !== instanceId
}

/** {@link LeaseStore} on the `LeaseLock` table, one row per name. @internal */
export class PrismaLeaseStore implements LeaseStore {
  constructor(private readonly prisma: LeasePrisma = defaultPrisma as unknown as LeasePrisma) {}

  async acquire({ name, instanceId, now, expiresAt }: LeaseClaim): Promise<boolean> {
    const row = await this.prisma.$transaction(async (tx) => {
      if (await legacyHolder(tx, name, instanceId, now)) return null

      await tx.leaseLock.deleteMany({ where: { name, expiresAt: { lt: now } } })
      const existing = await tx.leaseLock.findUnique({ where: { name } })
      if (!existing) {
        return tx.leaseLock.create({
          data: { name, instanceId, acquiredAt: now, expiresAt, lastRenewedAt: now },
        })
      }
      // The expired row was deleted above inside the same transaction, so only
      // our own row is updated here.
      if (existing.instanceId === instanceId) {
        return tx.leaseLock.update({ where: { name }, data: { expiresAt, lastRenewedAt: now } })
      }
      return null
    })
    return row !== null && row.instanceId === instanceId && row.expiresAt > now
  }

  async renew({ name, instanceId, now, expiresAt }: LeaseClaim): Promise<boolean> {
    const result = await this.prisma.leaseLock.updateMany({
      where: { name, instanceId, expiresAt: { gt: now } },
      data: { expiresAt, lastRenewedAt: now },
    })
    return result.count > 0
  }

  async release(name: LeaseName, instanceId: string): Promise<void> {
    await this.prisma.leaseLock.deleteMany({ where: { name, instanceId } })
  }
}

/** `${HOSTNAME}-${pid}-${random}`, so operators recognise the holder in the database. */
function generateInstanceId(): string {
  return `${process.env.HOSTNAME || "unknown"}-${process.pid}-${randomBytes(4).toString("hex")}`
}

export interface LeaseLockOptions {
  name: LeaseName
  /** Owner identity written to the lease. Defaults to a fresh process id. */
  instanceId?: string
  /** How long an acquired or renewed lease stays valid. */
  leaseDurationMs?: number
  /** Defaults to {@link PrismaLeaseStore}. */
  store?: LeaseStore
  /** Clock, injectable for tests. */
  now?: () => Date
}

/**
 * One process's handle on a named lease. {@link isHeld} is the one authority
 * on ownership for the {@link LeasePoller} that drives it: a failed renewal or
 * a store error clears it.
 */
export class LeaseLock {
  readonly name: LeaseName
  private readonly instanceId: string
  private readonly leaseDurationMs: number
  private readonly store: LeaseStore
  private readonly now: () => Date
  private held = false

  constructor(options: LeaseLockOptions) {
    this.name = options.name
    this.instanceId = options.instanceId ?? generateInstanceId()
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS
    this.store = options.store ?? new PrismaLeaseStore()
    this.now = options.now ?? (() => new Date())
  }

  getInstanceId(): string {
    return this.instanceId
  }

  getLeaseDurationMs(): number {
    return this.leaseDurationMs
  }

  /** The lease's claim from this moment. */
  private claim(): LeaseClaim {
    const now = this.now()
    return {
      name: this.name,
      instanceId: this.instanceId,
      now,
      expiresAt: new Date(now.getTime() + this.leaseDurationMs),
    }
  }

  /** Takes the lease. A held lease returns true without a store call. */
  async acquire(): Promise<boolean> {
    if (this.held) return true
    try {
      this.held = await this.store.acquire(this.claim())
      logger.debug(this.held ? "Lease acquired" : "Lease not available", { name: this.name })
    } catch (error) {
      logger.debug("Error acquiring lease", { name: this.name, error })
      this.held = false
    }
    return this.held
  }

  /** Extends the lease; a false answer or an error means it is no longer ours. */
  async renew(): Promise<boolean> {
    if (!this.held) return false
    try {
      this.held = await this.store.renew(this.claim())
      if (!this.held) logger.debug("Lease renewal failed: another instance may hold it", { name: this.name })
    } catch (error) {
      logger.debug("Error renewing lease", { name: this.name, error })
      this.held = false
    }
    return this.held
  }

  /** Gives the lease up. Held state clears even when the store call fails. */
  async release(): Promise<void> {
    if (!this.held) return
    try {
      await this.store.release(this.name, this.instanceId)
      logger.debug("Lease released", { name: this.name })
    } catch (error) {
      logger.debug("Error releasing lease", { name: this.name, error })
    } finally {
      this.held = false
    }
  }

  isHeld(): boolean {
    return this.held
  }
}
