import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { randomBytes } from "crypto"

const logger = createLogger("DISCORD_BOT_LOCK")

/**
 * Checks if the Discord bot is enabled in the database
 */
export async function isDiscordBotEnabled(): Promise<boolean> {
  try {
    const integration = await prisma.discordIntegration.findUnique({
      where: { id: "discord" },
      select: { botEnabled: true },
    })
    return integration?.botEnabled ?? false
  } catch (error) {
    logger.debug("Error checking if Discord bot is enabled", { error })
    return false
  }
}

// Lock lease duration in milliseconds (30 seconds)
const LOCK_LEASE_DURATION_MS = 30 * 1000

// How often to renew the lock (every 10 seconds)
const LOCK_RENEWAL_INTERVAL_MS = 10 * 1000

// Generate a unique instance ID for this pod/process
const INSTANCE_ID = `${process.env.HOSTNAME || "unknown"}-${process.pid}-${randomBytes(4).toString("hex")}`

interface LockState {
  isHeld: boolean
  instanceId: string | null
  renewalInterval?: NodeJS.Timeout
  releaseLock?: () => Promise<void>
}

let lockState: LockState = {
  isHeld: false,
  instanceId: null,
}

/**
 * Attempts to acquire a distributed lock for the Discord bot using a database lease table.
 * Only one instance across all pods can hold this lock at a time.
 * Uses PostgreSQL's row-level locking for atomic operations.
 *
 * @returns Promise<boolean> - true if lock was acquired, false otherwise
 */
export async function acquireDiscordBotLock(): Promise<boolean> {
  if (lockState.isHeld && lockState.instanceId === INSTANCE_ID) {
    logger.debug("Lock already held by this instance")
    return true
  }

  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + LOCK_LEASE_DURATION_MS)

    // Use a transaction with row-level locking to atomically acquire the lock
    const lockRecord = await prisma.$transaction(async (tx) => {
      // First, clean up expired locks
      await tx.discordBotLock.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      })

      // Try to acquire the lock
      const existing = await tx.discordBotLock.findUnique({
        where: { id: "discord-bot" },
      })

      if (!existing) {
        // No lock exists, create one
        return await tx.discordBotLock.create({
          data: {
            id: "discord-bot",
            instanceId: INSTANCE_ID,
            acquiredAt: now,
            expiresAt,
            lastRenewedAt: now,
          },
        })
      }

      // Lock exists - check if it's expired or if we own it
      if (existing.expiresAt < now || existing.instanceId === INSTANCE_ID) {
        // Lock is expired or we already own it - update it
        return await tx.discordBotLock.update({
          where: { id: "discord-bot" },
          data: {
            instanceId: INSTANCE_ID,
            expiresAt,
            lastRenewedAt: now,
            updatedAt: now,
          },
        })
      }

      // Lock is held by another instance
      return null
    })

    if (lockRecord && lockRecord.instanceId === INSTANCE_ID && lockRecord.expiresAt > now) {
      logger.debug("Discord bot lock acquired successfully", { instanceId: INSTANCE_ID })
      lockState.isHeld = true
      lockState.instanceId = INSTANCE_ID

      // Set up automatic lock renewal
      lockState.renewalInterval = setInterval(async () => {
        try {
          const renewed = await renewDiscordBotLock()
          if (!renewed) {
            logger.debug("Failed to renew lock - another instance may have taken it")
            lockState.isHeld = false
            lockState.instanceId = null
            if (lockState.renewalInterval) {
              clearInterval(lockState.renewalInterval)
              lockState.renewalInterval = undefined
            }
          }
        } catch (error) {
          logger.debug("Error renewing lock", { error })
          lockState.isHeld = false
          lockState.instanceId = null
          if (lockState.renewalInterval) {
            clearInterval(lockState.renewalInterval)
            lockState.renewalInterval = undefined
          }
        }
      }, LOCK_RENEWAL_INTERVAL_MS)

      // Set up cleanup function
      lockState.releaseLock = async () => {
        await releaseDiscordBotLock()
      }

      return true
    } else {
      logger.debug("Discord bot lock not available", {
        currentInstanceId: lockRecord?.instanceId,
        expiresAt: lockRecord?.expiresAt,
      })
      return false
    }
  } catch (error) {
    logger.debug("Error acquiring Discord bot lock", { error })
    return false
  }
}

/**
 * Renews the Discord bot lock lease
 */
async function renewDiscordBotLock(): Promise<boolean> {
  if (!lockState.isHeld || lockState.instanceId !== INSTANCE_ID) {
    return false
  }

  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + LOCK_LEASE_DURATION_MS)

    const result = await prisma.discordBotLock.updateMany({
      where: {
        id: "discord-bot",
        instanceId: INSTANCE_ID,
        expiresAt: {
          gt: now, // Only renew if not expired
        },
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
    } else {
      logger.debug("Lock renewal failed - lock may have been taken by another instance")
      return false
    }
  } catch (error) {
    logger.debug("Error renewing Discord bot lock", { error })
    return false
  }
}

/**
 * Releases the Discord bot lock
 */
export async function releaseDiscordBotLock(): Promise<void> {
  if (!lockState.isHeld || lockState.instanceId !== INSTANCE_ID) {
    return
  }

  try {
    // Clear renewal interval
    if (lockState.renewalInterval) {
      clearInterval(lockState.renewalInterval)
      lockState.renewalInterval = undefined
    }

    // Delete the lock record if we still own it
    await prisma.discordBotLock.deleteMany({
      where: {
        id: "discord-bot",
        instanceId: INSTANCE_ID,
      },
    })

    lockState.isHeld = false
    lockState.instanceId = null
    lockState.releaseLock = undefined

    logger.debug("Discord bot lock released successfully")
  } catch (error) {
    logger.debug("Error releasing Discord bot lock", { error })
    // Reset state even if release fails
    lockState.isHeld = false
    lockState.instanceId = null
    lockState.releaseLock = undefined
  }
}

/**
 * Checks if this instance currently holds the lock
 */
export function hasDiscordBotLock(): boolean {
  return lockState.isHeld && lockState.instanceId === INSTANCE_ID
}

/**
 * Attempts to acquire the lock with retries
 * Useful for initial startup when multiple pods start simultaneously
 */
export async function acquireDiscordBotLockWithRetry(
  maxRetries: number = 5,
  retryDelayMs: number = 2000
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const acquired = await acquireDiscordBotLock()
    if (acquired) {
      return true
    }

    if (attempt < maxRetries) {
      logger.debug(`Lock acquisition attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelayMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }

  logger.debug(`Failed to acquire lock after ${maxRetries} attempts`)
  return false
}

// Polling state for background lock acquisition
interface PollingState {
  isPolling: boolean
  pollingInterval?: NodeJS.Timeout
  botInitialized: boolean
  onLockAcquired?: () => Promise<void>
  onLockLost?: () => Promise<void>
}

let pollingState: PollingState = {
  isPolling: false,
  botInitialized: false,
}

/**
 * Starts background polling to acquire the Discord bot lock
 * Tries every minute until the lock is acquired
 *
 * @param onLockAcquired - Callback when lock is successfully acquired
 * @param onLockLost - Callback when lock is lost (optional)
 * @param pollIntervalMs - How often to poll (default: 60 seconds)
 */
export async function startDiscordBotLockPolling(
  onLockAcquired: () => Promise<void>,
  onLockLost?: () => Promise<void>,
  pollIntervalMs: number = 10 * 1000
): Promise<void> {
  if (pollingState.isPolling) {
    logger.debug("Lock polling already started")
    return
  }

  pollingState.isPolling = true
  pollingState.onLockAcquired = onLockAcquired
  pollingState.onLockLost = onLockLost

  logger.debug(`Starting Discord bot lock polling (every ${pollIntervalMs / 1000} seconds)`)

  // Check if bot is enabled before trying to acquire lock
  const botEnabled = await isDiscordBotEnabled()
  if (!botEnabled) {
    logger.debug("Bot disabled in database - not attempting to acquire lock")
    return
  }

  // Try immediately on startup
  const immediateAcquired = await acquireDiscordBotLock()
  if (immediateAcquired) {
    logger.debug("Lock acquired immediately on startup")
    pollingState.botInitialized = true
    await onLockAcquired()
  } else {
    logger.debug("Lock not available on startup, will poll periodically")
  }

  // Set up periodic polling
  pollingState.pollingInterval = setInterval(async () => {
    if (!pollingState.isPolling) {
      return
    }

    try {
      // Check if bot is enabled in database
      const botEnabled = await isDiscordBotEnabled()

      if (!botEnabled) {
        // Bot is disabled - shut down if running
        if (pollingState.botInitialized) {
          logger.debug("Bot disabled in database - shutting down bot")
          pollingState.botInitialized = false
          if (onLockLost) {
            await onLockLost()
          }
          await releaseDiscordBotLock()
        }
        return
      }

      // Check if we still hold the lock if bot is initialized
      if (pollingState.botInitialized) {
        const stillHoldsLock = hasDiscordBotLock()
        if (!stillHoldsLock) {
          // We lost the lock
          logger.debug("Lock lost during polling - shutting down bot")
          pollingState.botInitialized = false
          if (onLockLost) {
            await onLockLost()
          }
          return
        }
        // Lock renewal is handled by the renewal interval in acquireDiscordBotLock
        return
      }

      // Bot not initialized but enabled - try to acquire the lock
      const acquired = await acquireDiscordBotLock()

      if (acquired) {
        logger.debug("Lock acquired during polling - initializing bot")
        pollingState.botInitialized = true
        await onLockAcquired()
      }
    } catch (error) {
      logger.debug("Error during lock polling", { error })
    }
  }, pollIntervalMs)
}

/**
 * Stops the background lock polling
 */
export async function stopDiscordBotLockPolling(): Promise<void> {
  if (!pollingState.isPolling) {
    return
  }

  logger.debug("Stopping Discord bot lock polling")
  pollingState.isPolling = false

  if (pollingState.pollingInterval) {
    clearInterval(pollingState.pollingInterval)
    pollingState.pollingInterval = undefined
  }

  // Call onLockLost if bot was initialized (to clean up bot instance)
  if (pollingState.botInitialized && pollingState.onLockLost) {
    try {
      await pollingState.onLockLost()
    } catch (error) {
      logger.debug("Error during lock lost callback on stop", { error })
    }
  }

  // Release lock if we hold it
  if (pollingState.botInitialized) {
    await releaseDiscordBotLock()
    pollingState.botInitialized = false
  }

  pollingState.onLockAcquired = undefined
  pollingState.onLockLost = undefined
}

