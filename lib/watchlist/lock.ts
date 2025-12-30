import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { randomBytes } from "crypto"

const logger = createLogger("WATCHLIST_SYNC_LOCK")

/**
 * Checks if watchlist sync is enabled globally in the database
 */
export async function isWatchlistSyncEnabled(): Promise<boolean> {
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncEnabled: true },
    })
    return config?.watchlistSyncEnabled ?? false
  } catch (error) {
    logger.debug("Error checking if watchlist sync is enabled", { error })
    return false
  }
}

/**
 * Gets the global sync interval in minutes
 */
export async function getWatchlistSyncInterval(): Promise<number> {
  try {
    const config = await prisma.config.findUnique({
      where: { id: "config" },
      select: { watchlistSyncIntervalMinutes: true },
    })
    return config?.watchlistSyncIntervalMinutes ?? 60
  } catch (error) {
    logger.debug("Error getting watchlist sync interval", { error })
    return 60
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
 * Attempts to acquire a distributed lock for watchlist sync using a database lease table.
 * Only one instance across all pods can hold this lock at a time.
 * Uses PostgreSQL's row-level locking for atomic operations.
 */
export async function acquireWatchlistSyncLock(): Promise<boolean> {
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
      await tx.watchlistSyncLock.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      })

      // Try to acquire the lock
      const existing = await tx.watchlistSyncLock.findUnique({
        where: { id: "watchlist-sync" },
      })

      if (!existing) {
        // No lock exists, create one
        return await tx.watchlistSyncLock.create({
          data: {
            id: "watchlist-sync",
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
        return await tx.watchlistSyncLock.update({
          where: { id: "watchlist-sync" },
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
      logger.debug("Watchlist sync lock acquired successfully", { instanceId: INSTANCE_ID })
      lockState.isHeld = true
      lockState.instanceId = INSTANCE_ID

      // Set up automatic lock renewal
      lockState.renewalInterval = setInterval(async () => {
        try {
          const renewed = await renewWatchlistSyncLock()
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
        await releaseWatchlistSyncLock()
      }

      return true
    } else {
      logger.debug("Watchlist sync lock not available", {
        currentInstanceId: lockRecord?.instanceId,
        expiresAt: lockRecord?.expiresAt,
      })
      return false
    }
  } catch (error) {
    logger.debug("Error acquiring watchlist sync lock", { error })
    return false
  }
}

/**
 * Renews the watchlist sync lock lease
 */
async function renewWatchlistSyncLock(): Promise<boolean> {
  if (!lockState.isHeld || lockState.instanceId !== INSTANCE_ID) {
    return false
  }

  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + LOCK_LEASE_DURATION_MS)

    const result = await prisma.watchlistSyncLock.updateMany({
      where: {
        id: "watchlist-sync",
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
    logger.debug("Error renewing watchlist sync lock", { error })
    return false
  }
}

/**
 * Releases the watchlist sync lock
 */
export async function releaseWatchlistSyncLock(): Promise<void> {
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
    await prisma.watchlistSyncLock.deleteMany({
      where: {
        id: "watchlist-sync",
        instanceId: INSTANCE_ID,
      },
    })

    lockState.isHeld = false
    lockState.instanceId = null
    lockState.releaseLock = undefined

    logger.debug("Watchlist sync lock released successfully")
  } catch (error) {
    logger.debug("Error releasing watchlist sync lock", { error })
    // Reset state even if release fails
    lockState.isHeld = false
    lockState.instanceId = null
    lockState.releaseLock = undefined
  }
}

/**
 * Checks if this instance currently holds the lock
 */
export function hasWatchlistSyncLock(): boolean {
  return lockState.isHeld && lockState.instanceId === INSTANCE_ID
}

// Polling state for background lock acquisition
interface PollingState {
  isPolling: boolean
  pollingInterval?: NodeJS.Timeout
  syncInitialized: boolean
  onLockAcquired?: () => Promise<void>
  onLockLost?: () => Promise<void>
}

let pollingState: PollingState = {
  isPolling: false,
  syncInitialized: false,
}

/**
 * Starts background polling to acquire the watchlist sync lock
 * Tries every minute until the lock is acquired
 *
 * @param onLockAcquired - Callback when lock is successfully acquired
 * @param onLockLost - Callback when lock is lost (optional)
 * @param pollIntervalMs - How often to poll (default: 60 seconds)
 */
export async function startWatchlistSyncPolling(
  onLockAcquired: () => Promise<void>,
  onLockLost?: () => Promise<void>,
  pollIntervalMs: number = 60 * 1000
): Promise<void> {
  if (pollingState.isPolling) {
    logger.debug("Lock polling already started")
    return
  }

  pollingState.isPolling = true
  pollingState.onLockAcquired = onLockAcquired
  pollingState.onLockLost = onLockLost

  logger.debug(`Starting watchlist sync lock polling (every ${pollIntervalMs / 1000} seconds)`)

  // Check if sync is enabled before trying to acquire lock
  const syncEnabled = await isWatchlistSyncEnabled()
  if (!syncEnabled) {
    logger.debug("Watchlist sync disabled in database - not attempting to acquire lock")
    return
  }

  // Try immediately on startup
  const immediateAcquired = await acquireWatchlistSyncLock()
  if (immediateAcquired) {
    logger.debug("Lock acquired immediately on startup")
    pollingState.syncInitialized = true
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
      // Check if sync is enabled in database
      const syncEnabled = await isWatchlistSyncEnabled()

      if (!syncEnabled) {
        // Sync is disabled - shut down if running
        if (pollingState.syncInitialized) {
          logger.debug("Watchlist sync disabled in database - shutting down sync")
          pollingState.syncInitialized = false
          if (onLockLost) {
            await onLockLost()
          }
          await releaseWatchlistSyncLock()
        }
        return
      }

      // Check if we still hold the lock if sync is initialized
      if (pollingState.syncInitialized) {
        const stillHoldsLock = hasWatchlistSyncLock()
        if (!stillHoldsLock) {
          // We lost the lock
          logger.debug("Lock lost during polling - shutting down sync")
          pollingState.syncInitialized = false
          if (onLockLost) {
            await onLockLost()
          }
          return
        }
        // Lock renewal is handled by the renewal interval in acquireWatchlistSyncLock
        return
      }

      // Sync not initialized but enabled - try to acquire the lock
      const acquired = await acquireWatchlistSyncLock()

      if (acquired) {
        logger.debug("Lock acquired during polling - initializing sync")
        pollingState.syncInitialized = true
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
export async function stopWatchlistSyncPolling(): Promise<void> {
  if (!pollingState.isPolling) {
    return
  }

  logger.debug("Stopping watchlist sync lock polling")
  pollingState.isPolling = false

  if (pollingState.pollingInterval) {
    clearInterval(pollingState.pollingInterval)
    pollingState.pollingInterval = undefined
  }

  // Call onLockLost if sync was initialized (to clean up)
  if (pollingState.syncInitialized && pollingState.onLockLost) {
    try {
      await pollingState.onLockLost()
    } catch (error) {
      logger.debug("Error during lock lost callback on stop", { error })
    }
  }

  // Release lock if we hold it
  if (pollingState.syncInitialized) {
    await releaseWatchlistSyncLock()
    pollingState.syncInitialized = false
  }

  pollingState.onLockAcquired = undefined
  pollingState.onLockLost = undefined
}
