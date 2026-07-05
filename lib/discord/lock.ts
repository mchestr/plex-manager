/**
 * # Discord bot distributed-lock facade
 *
 * Thin, backwards-compatible wrapper around {@link DistributedLock} and
 * {@link BotLockPoller}. The lock/poller logic now lives in `lib/discord/lock/`
 * as injectable classes (single source of truth for "who holds the lease"); this
 * module preserves the original free-function API so existing callers
 * (`actions/discord-activity.ts`, `lib/instrumentation/node.ts`) keep working
 * without import changes.
 *
 * A single module-level {@link DistributedLock} is created lazily and shared by
 * all the delegating functions, matching the previous ambient-module-global
 * behavior (one lock per process).
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { DistributedLock } from "./lock/lease"
import { BotLockPoller } from "./lock/poller"

const logger = createLogger("DISCORD_BOT_LOCK")

/**
 * Checks if the Discord bot is enabled in the database.
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

// --- Lazily-created process singletons (mirrors the old module globals) ---

let lockInstance: DistributedLock | null = null
let pollerInstance: BotLockPoller | null = null

function getLock(): DistributedLock {
  if (!lockInstance) {
    lockInstance = new DistributedLock()
  }
  return lockInstance
}

/**
 * Attempts to acquire the distributed lock for the Discord bot.
 *
 * @returns true if the lock is held by this instance afterwards
 */
export async function acquireDiscordBotLock(): Promise<boolean> {
  return getLock().acquire()
}

/**
 * Releases the Discord bot lock (deletes the row if we still own it).
 */
export async function releaseDiscordBotLock(): Promise<void> {
  await getLock().release()
}

/**
 * Whether this instance currently holds the lock.
 */
export function hasDiscordBotLock(): boolean {
  return getLock().isHeld()
}

/**
 * Attempts to acquire the lock with retries. Useful for startup races when
 * multiple pods start simultaneously.
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

/**
 * Starts background polling to acquire (and then renew) the Discord bot lock.
 *
 * Delegates to a shared {@link BotLockPoller} that drives acquire + renew off
 * the single {@link DistributedLock}. `isDiscordBotEnabled` gates each tick, as
 * before.
 *
 * @param onLockAcquired - Callback when the lock is successfully acquired
 * @param onLockLost - Callback when the lock is lost / bot disabled (optional)
 * @param pollIntervalMs - How often to poll (default: 10 seconds)
 */
export async function startDiscordBotLockPolling(
  onLockAcquired: () => Promise<void>,
  onLockLost?: () => Promise<void>,
  pollIntervalMs: number = 10 * 1000
): Promise<void> {
  if (pollerInstance) {
    logger.debug("Lock polling already started")
    return
  }

  pollerInstance = new BotLockPoller(
    getLock(),
    {
      onLockAcquired,
      onLockLost: onLockLost ?? (async () => {}),
      isEnabled: isDiscordBotEnabled,
    },
    { pollIntervalMs }
  )

  await pollerInstance.start()
}

/**
 * Stops the background lock polling and releases the lock if held.
 */
export async function stopDiscordBotLockPolling(): Promise<void> {
  if (!pollerInstance) {
    return
  }

  await pollerInstance.stop()
  pollerInstance = null
}
