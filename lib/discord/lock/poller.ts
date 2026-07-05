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
 *   # --- Step 18 extension point ---
 *   # A future config-hash check goes HERE: if the bot config/token changed
 *   # while running, treat it like a lock-loss (stop) so the next tick
 *   # re-acquires and re-initializes with fresh config. See wiring in
 *   # instrumentation/node.ts.
 *
 *   if running:
 *       if !(await lock.renew()) -> onLockLost(); running = false   # lost it
 *   else:
 *       if await lock.acquire() -> onLockAcquired(); running = true
 * ```
 */
export class BotLockPoller {
  private readonly lock: DistributedLock
  private readonly callbacks: BotLockPollerCallbacks
  private readonly pollIntervalMs: number

  private timer?: ReturnType<typeof setInterval>
  private polling = false
  /** True once onLockAcquired has fired and not yet been undone by onLockLost. */
  private running = false

  constructor(
    lock: DistributedLock,
    callbacks: BotLockPollerCallbacks,
    options: BotLockPollerOptions = {}
  ) {
    this.lock = lock
    this.callbacks = callbacks
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
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

      // --- Step 18 extension point (config-change / token-rotation bounce) ---
      // A future config-hash comparison belongs here: when the tracked config
      // changes while `this.running`, stop the bot (onLockLost + release) so the
      // next tick re-acquires and re-initializes with the new config. Not
      // implemented yet; the loop is structured so it slots in without touching
      // the acquire/renew branches below.

      if (this.running) {
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
        await this.callbacks.onLockAcquired()
      }
    } catch (error) {
      logger.debug("Error during lock polling", { error })
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
