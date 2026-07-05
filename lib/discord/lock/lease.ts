import { prisma as defaultPrisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { randomBytes } from "crypto"
import type { PrismaClient } from "@/lib/generated/prisma/client"

const logger = createLogger("DISCORD_BOT_LOCK")

// Lock lease duration in milliseconds (30 seconds)
export const DEFAULT_LOCK_LEASE_DURATION_MS = 30 * 1000

// The primary key of the singleton lock row.
export const DISCORD_BOT_LOCK_ID = "discord-bot"

/**
 * Generates a process-unique instance id for lock ownership.
 *
 * Shape mirrors the previous ambient-module value:
 * `${HOSTNAME}-${pid}-${random}` so operators recognize it in the DB / admin UI.
 */
export function generateInstanceId(): string {
  return `${process.env.HOSTNAME || "unknown"}-${process.pid}-${randomBytes(4).toString("hex")}`
}

/**
 * A `prisma`-shaped subset containing only the models/ops the lock touches.
 * Accepting this (rather than the full client) keeps the class trivially mockable.
 */
type LockPrisma = Pick<PrismaClient, "$transaction" | "discordBotLock">

export interface DistributedLockOptions {
  /** Owner identity written to the lock row. Defaults to a fresh process id. */
  instanceId?: string
  /** How long an acquired/renewed lease is valid for. */
  leaseDurationMs?: number
  /** Prisma client (injectable for tests). */
  prisma?: LockPrisma
  /** Clock, injectable for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date
}

/**
 * # DistributedLock
 *
 * Encapsulates the Discord-bot distributed lock backed by the `DiscordBotLock`
 * DB row. Only one instance across all pods can hold the lock at a time.
 *
 * ## Why a class
 *
 * The lease's "am I the holder?" truth lives in {@link isHeld} as instance
 * state instead of an ambient module global. This lets the {@link BotLockPoller}
 * drive both polling and renewal off the *same* object, removing the previous
 * two-timer inconsistency where the renewal timer and the poll timer could read
 * / write divergent copies of the "held" flag.
 *
 * All timings and the owning `instanceId` are constructor params so tests can
 * inject a mock prisma, a fixed instance id, and a deterministic clock.
 */
export class DistributedLock {
  private readonly instanceId: string
  private readonly leaseDurationMs: number
  private readonly prisma: LockPrisma
  private readonly now: () => Date

  private held = false

  constructor(options: DistributedLockOptions = {}) {
    this.instanceId = options.instanceId ?? generateInstanceId()
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LOCK_LEASE_DURATION_MS
    this.prisma = options.prisma ?? (defaultPrisma as unknown as LockPrisma)
    this.now = options.now ?? (() => new Date())
  }

  /** The owner identity this lock writes to the DB row. */
  getInstanceId(): string {
    return this.instanceId
  }

  /**
   * Attempts to acquire (or, if already ours, re-acquire) the lock atomically.
   * Uses a transaction so expired-lock cleanup and take-over are race-free.
   *
   * @returns true if this instance holds the lock afterwards, false otherwise
   */
  async acquire(): Promise<boolean> {
    if (this.held) {
      logger.debug("Lock already held by this instance")
      return true
    }

    try {
      const now = this.now()
      const expiresAt = new Date(now.getTime() + this.leaseDurationMs)

      const lockRecord = await this.prisma.$transaction(async (tx) => {
        // First, clean up expired locks
        await tx.discordBotLock.deleteMany({
          where: { expiresAt: { lt: now } },
        })

        const existing = await tx.discordBotLock.findUnique({
          where: { id: DISCORD_BOT_LOCK_ID },
        })

        if (!existing) {
          // No lock exists, create one
          return await tx.discordBotLock.create({
            data: {
              id: DISCORD_BOT_LOCK_ID,
              instanceId: this.instanceId,
              acquiredAt: now,
              expiresAt,
              lastRenewedAt: now,
            },
          })
        }

        // Lock exists - take it over if we already own it, or (belt-and-braces)
        // if it is somehow still expired. Safe here — unlike renew()'s bare
        // updateMany, this whole block runs in one Serializable transaction that
        // already deleted expired rows above, so a competing acquirer cannot
        // interleave: the expired branch is effectively unreachable (read-your-
        // writes) and only a genuine self-owned or race-free takeover updates.
        if (existing.expiresAt < now || existing.instanceId === this.instanceId) {
          return await tx.discordBotLock.update({
            where: { id: DISCORD_BOT_LOCK_ID },
            data: {
              instanceId: this.instanceId,
              expiresAt,
              lastRenewedAt: now,
              updatedAt: now,
            },
          })
        }

        // Lock is held by another instance
        return null
      })

      if (lockRecord && lockRecord.instanceId === this.instanceId && lockRecord.expiresAt > now) {
        logger.debug("Discord bot lock acquired successfully", { instanceId: this.instanceId })
        this.held = true
        return true
      }

      logger.debug("Discord bot lock not available", {
        currentInstanceId: lockRecord?.instanceId,
        expiresAt: lockRecord?.expiresAt,
      })
      return false
    } catch (error) {
      logger.debug("Error acquiring Discord bot lock", { error })
      return false
    }
  }

  /**
   * Renews the lease. Marks the lock as no longer held (returns false) if the
   * row was taken by another instance or the renewal write matched nothing.
   *
   * @returns true if the lease was extended, false otherwise
   */
  async renew(): Promise<boolean> {
    if (!this.held) {
      return false
    }

    try {
      const now = this.now()
      const expiresAt = new Date(now.getTime() + this.leaseDurationMs)

      const result = await this.prisma.discordBotLock.updateMany({
        where: {
          id: DISCORD_BOT_LOCK_ID,
          instanceId: this.instanceId,
          expiresAt: { gt: now }, // Only renew if not expired
        },
        data: {
          expiresAt,
          lastRenewedAt: now,
          updatedAt: now,
        },
      })

      if (result.count > 0) {
        logger.debug("Lock renewed successfully")
        return true
      }

      logger.debug("Lock renewal failed - lock may have been taken by another instance")
      this.held = false
      return false
    } catch (error) {
      logger.debug("Error renewing Discord bot lock", { error })
      this.held = false
      return false
    }
  }

  /**
   * Releases the lock, deleting the DB row if (and only if) we still own it.
   * Always resets local held state, even if the delete fails.
   */
  async release(): Promise<void> {
    if (!this.held) {
      return
    }

    try {
      await this.prisma.discordBotLock.deleteMany({
        where: {
          id: DISCORD_BOT_LOCK_ID,
          instanceId: this.instanceId,
        },
      })
      logger.debug("Discord bot lock released successfully")
    } catch (error) {
      logger.debug("Error releasing Discord bot lock", { error })
    } finally {
      this.held = false
    }
  }

  /** Whether this instance currently believes it holds the lock. */
  isHeld(): boolean {
    return this.held
  }
}
