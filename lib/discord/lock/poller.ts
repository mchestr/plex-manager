import { createLogger } from "@/lib/utils/logger"
import type { DistributedLock } from "./lease"

const logger = createLogger("DISCORD_BOT_LOCK")

/**
 * How often the poll loop ticks (acquire, re-check enabled, config bounce).
 * Renewal runs on its own timer, so this only bounds how quickly a free lock is
 * picked up and a settings change is applied.
 */
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
   * How often to renew the lease while the bot runs. Defaults to a third of the
   * lock's lease (10 s for the default 30 s lease). It must be less than half
   * the lease, so one late or failed renewal still leaves time for the next
   * before the lease lapses; the constructor throws otherwise (BP-12).
   */
  renewIntervalMs?: number
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
 * Owns the background loops that manage the Discord-bot distributed lock
 * lifecycle, all driven off one shared {@link DistributedLock} instance.
 *
 * ## Two timers, one lock
 *
 * - The **poll** timer (`pollIntervalMs`) acquires the lock while the bot is not
 *   running, re-checks the enabled flag, and bounces the bot on a config change.
 * - The **renewal** timer (`renewIntervalMs`, a third of the lease by default)
 *   runs only while the bot runs, and only renews the lease.
 *
 * Renewal used to ride on the poll tick, so a poll interval longer than the
 * lease (the old 60 s default against the 30 s lease) let the lease lapse
 * between ticks and the bot dropped offline every minute (BP-12). Renewal now
 * starts the moment the lock is acquired, before the bot logs in (which takes
 * seconds), and keeps running through a config bounce.
 *
 * Both timers share one `running` flag and one lock object, and
 * `this.lock.isHeld()` stays the only authority on ownership. The lifecycle
 * callbacks run one at a time (see {@link runLifecycle}), so a renewal that
 * fails while the bot logs in tears it down after the login, never during it.
 *
 * ## Poll tick
 *
 * ```
 * every pollIntervalMs:
 *   enabled = await isEnabled()
 *   if !enabled:
 *       if running -> stop renewal; onLockLost(); release()
 *       return
 *
 *   if running:
 *       # --- Step 18: config-change / token-rotation bounce (FR-13) ---
 *       # Only the holder reaches here, so only the holder bounces.
 *       if getConfigVersion() != lastConfigVersion:
 *           onLockLost(); onLockAcquired(); lastConfigVersion = current  # in-place re-init
 *           on failure -> stop renewal; release()                       # next tick re-acquires
 *   else:
 *       if await lock.acquire() -> start renewal; snapshot version; onLockAcquired()
 * ```
 *
 * ## Renewal tick
 *
 * ```
 * every renewIntervalMs while running (skipped while a renewal is in flight):
 *   if !(await lock.renew()) and still running -> stop renewal; onLockLost()
 * ```
 */
export class BotLockPoller {
  private readonly lock: DistributedLock
  private readonly callbacks: BotLockPollerCallbacks
  private readonly pollIntervalMs: number
  private readonly renewIntervalMs: number
  private readonly getConfigVersion: () => Promise<number>

  private timer?: ReturnType<typeof setInterval>
  private renewTimer?: ReturnType<typeof setInterval>
  private polling = false
  /**
   * Guards against overlapping ticks: if a tick's async work (acquire / bounce)
   * outlasts the poll interval, the next interval fire is skipped rather than
   * running concurrently against the same lock/bot state.
   */
  private ticking = false
  /** Skips a renewal fire while the previous renewal is still in flight. */
  private renewing = false
  /** True once onLockAcquired has fired and not yet been undone by onLockLost. */
  private running = false
  /**
   * The `configVersion` the currently-initialized bot was started with. Captured
   * whenever the bot is (re-)initialized while running; a later tick observing a
   * different version bounces the bot to pick up fresh config.
   */
  private lastConfigVersion = 0
  /** Tail of the lifecycle-callback queue (see {@link runLifecycle}). */
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(
    lock: DistributedLock,
    callbacks: BotLockPollerCallbacks,
    options: BotLockPollerOptions = {}
  ) {
    const leaseDurationMs = lock.getLeaseDurationMs()
    const renewIntervalMs = options.renewIntervalMs ?? Math.floor(leaseDurationMs / 3)
    if (renewIntervalMs >= leaseDurationMs / 2) {
      throw new Error(
        `Discord bot lock renewal interval (${renewIntervalMs} ms) must be less than half the lease (${leaseDurationMs} ms)`
      )
    }

    this.lock = lock
    this.callbacks = callbacks
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.renewIntervalMs = renewIntervalMs
    this.getConfigVersion = options.getConfigVersion ?? defaultGetConfigVersion
  }

  /**
   * Begins polling. Attempts an immediate acquire (if enabled) then installs the
   * recurring poll tick. Idempotent: a second call while already polling is a
   * no-op.
   */
  async start(): Promise<void> {
    if (this.polling) {
      logger.debug("Lock polling already started")
      return
    }

    this.polling = true
    logger.debug(
      `Starting Discord bot lock polling (every ${this.pollIntervalMs / 1000} seconds, renewing every ${this.renewIntervalMs / 1000} seconds)`
    )

    // Try immediately on startup so a free lock is grabbed without waiting a tick.
    try {
      const enabled = await this.callbacks.isEnabled()
      if (enabled) {
        const acquired = await this.lock.acquire()
        if (acquired) {
          logger.debug("Lock acquired immediately on startup")
          this.markRunning()
          // Snapshot the config version we're initializing against so a later
          // tick can detect a rotation and bounce (Step 18).
          this.lastConfigVersion = await this.getConfigVersion()
          await this.runLifecycle(() => this.callbacks.onLockAcquired())
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
   * One iteration of the poll loop. Extracted so tests can advance fake timers
   * and assert behavior deterministically.
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
          this.markStopped()
          await this.runLifecycle(() => this.callbacks.onLockLost())
          await this.lock.release()
        }
        return
      }

      if (this.running) {
        // --- Step 18: config-change / token-rotation bounce (FR-13) ---
        // Only the lock HOLDER runs this branch, so only the holder bounces
        // (the guarantee the design relies on). If the tracked config version
        // changed since we initialized, re-initialize in place so the client
        // logs in with the fresh token. We keep the lock across the bounce, and
        // the renewal timer keeps the lease alive while the bot logs in again.
        const currentConfigVersion = await this.getConfigVersion()
        if (currentConfigVersion !== this.lastConfigVersion) {
          logger.info("Discord config changed - bouncing bot to apply new config", {
            from: this.lastConfigVersion,
            to: currentConfigVersion,
          })
          try {
            // Lost-then-re-acquired path: tear down, then re-init with fresh config.
            await this.runLifecycle(async () => {
              await this.callbacks.onLockLost()
              await this.callbacks.onLockAcquired()
            })
            // Only mark applied once the re-init succeeded, so a failed bounce
            // is retried rather than silently skipped.
            this.lastConfigVersion = currentConfigVersion
          } catch (error) {
            // Never leave a half-initialized client: release the lease so
            // another pod can take over, and let the next tick re-acquire.
            logger.error("Failed to re-initialize Discord bot after config change - releasing lock", { error })
            this.markStopped()
            await this.lock.release()
          }
        }
        return
      }

      // Not running but enabled - try to acquire.
      const acquired = await this.lock.acquire()
      if (acquired) {
        logger.debug("Lock acquired during polling - initializing bot")
        this.markRunning()
        // Snapshot the config version for the freshly-initialized bot.
        this.lastConfigVersion = await this.getConfigVersion()
        await this.runLifecycle(() => this.callbacks.onLockAcquired())
      }
    } catch (error) {
      logger.debug("Error during lock polling", { error })
    } finally {
      this.ticking = false
    }
  }

  /**
   * One renewal: extends the lease off the same lock object. A failed renewal
   * means the lease is gone, so the bot stops and the poll loop re-acquires.
   *
   * @internal
   */
  private async renewLease(): Promise<void> {
    if (this.renewing) {
      logger.debug("Previous lock renewal still in progress - skipping this renewal")
      return
    }
    this.renewing = true

    try {
      const renewed = await this.lock.renew()
      // The poll loop or stop() may have ended the run while renew() was in
      // flight; they already fired onLockLost.
      if (renewed || !this.running) {
        return
      }
      logger.debug("Lock renewal failed - shutting down bot")
      this.markStopped()
      await this.runLifecycle(() => this.callbacks.onLockLost())
    } catch (error) {
      logger.debug("Error shutting down bot after a failed lock renewal", { error })
    } finally {
      this.renewing = false
    }
  }

  /**
   * Runs a lifecycle callback after the one in flight, if any. Without this a
   * renewal that fails while the bot is still logging in would destroy the
   * client mid-login. A rejection reaches only this caller; the queue moves on.
   *
   * @internal
   */
  private runLifecycle(callback: () => Promise<void>): Promise<void> {
    const run = this.lifecycle.then(callback)
    this.lifecycle = run.catch(() => undefined)
    return run
  }

  /** Marks the bot running and starts renewing the lease. @internal */
  private markRunning(): void {
    this.running = true
    this.renewTimer = setInterval(() => {
      void this.renewLease()
    }, this.renewIntervalMs)
  }

  /** Marks the bot stopped and stops renewing the lease. @internal */
  private markStopped(): void {
    this.running = false
    if (this.renewTimer) {
      clearInterval(this.renewTimer)
      this.renewTimer = undefined
    }
  }

  /**
   * Stops polling, clears both timers, and — if the bot was running — fires
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

    if (!this.running) {
      return
    }

    // Mark stopped before awaiting, so a renewal in flight cannot fire
    // onLockLost a second time. Shutdown deliberately skips the lifecycle
    // queue: a login that hangs must not hold up process exit.
    this.markStopped()
    try {
      await this.callbacks.onLockLost()
    } catch (error) {
      logger.debug("Error during lock lost callback on stop", { error })
    }
    await this.lock.release()
  }
}
