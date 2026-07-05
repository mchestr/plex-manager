import { createLogger } from "@/lib/utils/logger"
import type { DistributedLock } from "./lease"

const logger = createLogger("DISCORD_BOT_LOCK")

// How often the unified poll loop ticks (acquire / renew / re-check enabled).
export const DEFAULT_POLL_INTERVAL_MS = 10 * 1000

export interface BotLockPollerCallbacks {
  /** Fired once when the lock is acquired and the bot should start. */
  onLockAcquired: () => Promise<void>
  /** Fired once when the lock is lost or the bot is disabled and should stop. */
  onLockLost: () => Promise<void>
  /** Whether the bot is enabled (DB flag). Checked every tick. */
  isEnabled: () => Promise<boolean>
}

export interface BotLockPollerOptions {
  /** How often to run the poll loop. Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  pollIntervalMs?: number
  /**
   * Reads the current bot config version (bumped whenever the token / support
   * config changes). Injectable for tests. Defaults to a resolver that reads
   * `DiscordIntegration.configVersion` (0 when no row exists). See {@link tick}
   * for how a version change triggers a re-init bounce (Step 18 / FR-13).
   */
  getConfigVersion?: () => Promise<number>
}

/**
 * Default {@link BotLockPollerOptions.getConfigVersion} resolver: reads
 * `DiscordIntegration.configVersion` from the DB, defaulting to 0 when the row
 * is absent. Imported lazily inside the closure so the poller module stays free
 * of a hard prisma dependency for tests that inject their own resolver.
 *
 * @internal
 */
async function defaultGetConfigVersion(): Promise<number> {
  const { prisma } = await import("@/lib/prisma")
  const row = await prisma.discordIntegration.findUnique({
    where: { id: "discord" },
    select: { configVersion: true },
  })
  return row?.configVersion ?? 0
}

/**
 * # BotLockPoller
 *
 * Owns the *single* background loop that manages the Discord-bot distributed
 * lock lifecycle. It drives acquisition, renewal, and release off one shared
 * {@link DistributedLock} instance.
 *
 * ## Single source of truth
 *
 * Previously two independent `setInterval` timers (one for lease renewal, one
 * for polling) each mutated a module-global "is held" flag and could disagree —
 * e.g. the poller could believe the lock was held while a failed renewal had
 * already surrendered it, or vice-versa. Here there is exactly one timer and one
 * lock object: every tick renews (when running) or re-acquires (when not) via
 * `this.lock`, and `this.lock.isHeld()` is the only authority. The two timers
 * can no longer diverge because there is only one.
 *
 * ## Tick algorithm
 *
 * ```
 * every pollIntervalMs:
 *   enabled = await isEnabled()
 *   if !enabled:
 *       if running -> onLockLost(); release(); running = false
 *       return
 *
 *   if running:
 *       # --- Step 18: config-change / token-rotation bounce (FR-13) ---
 *       # Only the holder reaches here, so only the holder bounces.
 *       if getConfigVersion() != lastConfigVersion:
 *           onLockLost(); onLockAcquired(); lastConfigVersion = current  # in-place re-init
 *           on failure -> release(); running = false                    # let next tick re-acquire
 *           return
 *       if !(await lock.renew()) -> onLockLost(); running = false        # lost it
 *   else:
 *       if await lock.acquire() -> onLockAcquired(); running = true; snapshot version
 * ```
 */
export class BotLockPoller {
  private readonly lock: DistributedLock
  private readonly callbacks: BotLockPollerCallbacks
  private readonly pollIntervalMs: number
  private readonly getConfigVersion: () => Promise<number>

  private timer?: ReturnType<typeof setInterval>
  private polling = false
  /**
   * Guards against overlapping ticks: if a tick's async work (acquire / renew /
   * bounce) outlasts the poll interval, the next interval fire is skipped rather
   * than running concurrently against the same lock/bot state.
   */
  private ticking = false
  /** True once onLockAcquired has fired and not yet been undone by onLockLost. */
  private running = false
  /**
   * The `configVersion` the currently-initialized bot was started with. Captured
   * whenever the bot is (re-)initialized while running; a later tick observing a
   * different version bounces the bot to pick up fresh config.
   */
  private lastConfigVersion = 0

  constructor(
    lock: DistributedLock,
    callbacks: BotLockPollerCallbacks,
    options: BotLockPollerOptions = {}
  ) {
    this.lock = lock
    this.callbacks = callbacks
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.getConfigVersion = options.getConfigVersion ?? defaultGetConfigVersion
  }

  /**
   * Begins polling. Attempts an immediate acquire (if enabled) then installs the
   * single recurring tick. Idempotent: a second call while already polling is a
   * no-op.
   */
  async start(): Promise<void> {
    if (this.polling) {
      logger.debug("Lock polling already started")
      return
    }

    this.polling = true
    logger.debug(`Starting Discord bot lock polling (every ${this.pollIntervalMs / 1000} seconds)`)

    // Try immediately on startup so a free lock is grabbed without waiting a tick.
    try {
      const enabled = await this.callbacks.isEnabled()
      if (enabled) {
        const acquired = await this.lock.acquire()
        if (acquired) {
          logger.debug("Lock acquired immediately on startup")
          this.running = true
          // Snapshot the config version we're initializing against so a later
          // tick can detect a rotation and bounce (Step 18).
          this.lastConfigVersion = await this.getConfigVersion()
          await this.callbacks.onLockAcquired()
        } else {
          logger.debug("Lock not available on startup, will poll periodically")
        }
      } else {
        logger.debug("Bot disabled in database - not acquiring lock on startup")
      }
    } catch (error) {
      logger.debug("Error during initial lock acquisition", { error })
    }

    this.timer = setInterval(() => {
      void this.tick()
    }, this.pollIntervalMs)
  }

  /**
   * One iteration of the unified loop. Extracted so tests can advance fake
   * timers and assert behavior deterministically.
   *
   * @internal
   */
  private async tick(): Promise<void> {
    if (!this.polling) {
      return
    }

    // Skip if a previous tick is still in flight (its awaits outlasted the poll
    // interval); overlapping ticks would race on the shared lock/bot state.
    if (this.ticking) {
      logger.debug("Previous lock tick still in progress - skipping this tick")
      return
    }
    this.ticking = true

    try {
      const enabled = await this.callbacks.isEnabled()

      if (!enabled) {
        // Bot disabled - shut down if running.
        if (this.running) {
          logger.debug("Bot disabled in database - shutting down bot")
          this.running = false
          await this.callbacks.onLockLost()
          await this.lock.release()
        }
        return
      }

      if (this.running) {
        // --- Step 18: config-change / token-rotation bounce (FR-13) ---
        // Only the lock HOLDER runs this branch, so only the holder bounces
        // (the guarantee the design relies on). If the tracked config version
        // changed since we initialized, re-initialize in place so the client
        // logs in with the fresh token. We keep the lock across the bounce.
        const currentConfigVersion = await this.getConfigVersion()
        if (currentConfigVersion !== this.lastConfigVersion) {
          logger.info("Discord config changed - bouncing bot to apply new config", {
            from: this.lastConfigVersion,
            to: currentConfigVersion,
          })
          try {
            // Lost-then-re-acquired path: tear down, then re-init with fresh config.
            await this.callbacks.onLockLost()
            await this.callbacks.onLockAcquired()
            // Only mark applied once the re-init succeeded, so a failed bounce
            // is retried rather than silently skipped.
            this.lastConfigVersion = currentConfigVersion
          } catch (error) {
            // Never leave a half-initialized client: release the lease so
            // another pod can take over, and let the next tick re-acquire.
            logger.error("Failed to re-initialize Discord bot after config change - releasing lock", { error })
            this.running = false
            await this.lock.release()
          }
          return
        }

        // We hold the lock; keep the lease alive off the SAME lock object.
        const renewed = await this.lock.renew()
        if (!renewed) {
          logger.debug("Lock renewal failed - shutting down bot")
          this.running = false
          await this.callbacks.onLockLost()
        }
        return
      }

      // Not running but enabled - try to acquire.
      const acquired = await this.lock.acquire()
      if (acquired) {
        logger.debug("Lock acquired during polling - initializing bot")
        this.running = true
        // Snapshot the config version for the freshly-initialized bot.
        this.lastConfigVersion = await this.getConfigVersion()
        await this.callbacks.onLockAcquired()
      }
    } catch (error) {
      logger.debug("Error during lock polling", { error })
    } finally {
      this.ticking = false
    }
  }

  /**
   * Stops polling, clears the timer, and — if the bot was running — fires
   * onLockLost and releases the lock. Idempotent.
   */
  async stop(): Promise<void> {
    if (!this.polling) {
      return
    }

    logger.debug("Stopping Discord bot lock polling")
    this.polling = false

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }

    if (this.running) {
      try {
        await this.callbacks.onLockLost()
      } catch (error) {
        logger.debug("Error during lock lost callback on stop", { error })
      }
      await this.lock.release()
      this.running = false
    }
  }
}
