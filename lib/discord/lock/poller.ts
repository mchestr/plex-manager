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
   * lock's lease (10 s for the default 30 s lease). It must be a finite number
   * above 0 and below half the lease, so one late or skipped renewal still
   * leaves time for the next before the lease lapses; the constructor throws
   * otherwise (BP-12). A renewal that fails is not retried: it ends the run.
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
 *       current = await getConfigVersion()
 *       if running and current != lastConfigVersion:
 *           queue: onLockLost(); onLockAcquired()   # in-place re-init, each only while running
 *           lastConfigVersion = current              # only if the re-init ran
 *           on failure -> stop renewal; release()    # next tick re-acquires
 *   else:
 *       version = await getConfigVersion()           # before acquire: a failed read takes nothing
 *       if await lock.acquire():
 *           if stopped meanwhile -> release(); return
 *           lastConfigVersion = version; start renewal; queue: onLockAcquired() while running
 * ```
 *
 * ## Ending a run
 *
 * Four paths end a run: disable, a failed bounce, a lost renewal and `stop()`.
 * Whichever sets `running` to false first tears the bot down. A lifecycle
 * callback queued before that (a bounce, or a login waiting behind a slow
 * teardown) re-checks `running` and skips its re-init, so the bot never comes
 * back up without the lease.
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
    // NaN, 0 or a negative interval would make setInterval fire every ~1 ms.
    if (!Number.isFinite(renewIntervalMs) || renewIntervalMs <= 0 || renewIntervalMs >= leaseDurationMs / 2) {
      throw new Error(
        `Discord bot lock renewal interval (${renewIntervalMs} ms) must be above 0 and less than half the lease (${leaseDurationMs} ms)`
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
        await this.acquireAndStart("on startup")
      } else {
        logger.debug("Bot disabled in database - not acquiring lock on startup")
      }
    } catch (error) {
      logger.debug("Error during initial lock acquisition", { error })
    }

    // stop() may have run during the startup attempt, and a start() after that
    // stop() may already have installed the poll.
    if (!this.polling || this.timer) {
      return
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
        await this.bounceIfConfigChanged()
        return
      }

      // Not running but enabled - try to acquire.
      await this.acquireAndStart("during polling")
    } catch (error) {
      logger.debug("Error during lock polling", { error })
    } finally {
      this.ticking = false
    }
  }

  /**
   * Takes the lock and starts the bot, if the lock is free.
   *
   * The config version is read before the acquire. Read after it, a failed read
   * left the lease held and renewed with no bot logged in, so no pod could run
   * the bot until a restart. Now a failed read takes nothing and the next tick
   * retries.
   *
   * @internal
   */
  private async acquireAndStart(when: "on startup" | "during polling"): Promise<void> {
    // Snapshot the version the bot initializes against, so a later tick can
    // detect a rotation and bounce (Step 18).
    const configVersion = await this.getConfigVersion()
    if (!(await this.lock.acquire())) {
      return
    }

    if (!this.polling) {
      logger.debug("Lock polling stopped while acquiring - releasing lock")
      await this.lock.release()
      return
    }

    logger.debug(`Lock acquired ${when} - initializing bot`)
    this.lastConfigVersion = configVersion
    // Renew from now on: the login below can take seconds.
    this.markRunning()
    await this.runLifecycle(async () => {
      // A lost renewal or stop() may end the run while an earlier callback
      // holds the queue; their teardown then stands.
      if (this.running) {
        await this.callbacks.onLockAcquired()
      }
    })
  }

  /**
   * Step 18 (FR-13): config-change / token-rotation bounce.
   *
   * Only the lock HOLDER calls this, so only the holder bounces (the guarantee
   * the design relies on). If the tracked config version changed since the bot
   * initialized, it re-initializes in place so the client logs in with the fresh
   * token. The lock is kept across the bounce, and the renewal timer keeps the
   * lease alive while the bot logs in again.
   *
   * A renewal can be lost, or stop() can run, during the version read or while
   * the bounce waits in the lifecycle queue. Their teardown is then queued or
   * done, so the bounce skips the re-init: otherwise the bot would come back up
   * with no lease, and nothing would tear it down.
   *
   * @internal
   */
  private async bounceIfConfigChanged(): Promise<void> {
    const currentConfigVersion = await this.getConfigVersion()
    if (!this.running || currentConfigVersion === this.lastConfigVersion) {
      return
    }

    logger.info("Discord config changed - bouncing bot to apply new config", {
      from: this.lastConfigVersion,
      to: currentConfigVersion,
    })
    try {
      // Lost-then-re-acquired path: tear down, then re-init with fresh config.
      const reinitialized = await this.runLifecycle(async () => {
        if (!this.running) {
          return false
        }
        await this.callbacks.onLockLost()
        if (!this.running) {
          return false
        }
        await this.callbacks.onLockAcquired()
        return true
      })
      // Only mark applied once the re-init ran and succeeded, so a failed
      // bounce is retried rather than silently skipped.
      if (reinitialized) {
        this.lastConfigVersion = currentConfigVersion
      }
    } catch (error) {
      // Never leave a half-initialized client: release the lease so another pod
      // can take over, and let the next tick re-acquire.
      logger.error("Failed to re-initialize Discord bot after config change - releasing lock", { error })
      this.markStopped()
      await this.lock.release()
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
  private runLifecycle<T>(callback: () => Promise<T>): Promise<T> {
    const run = this.lifecycle.then(callback)
    this.lifecycle = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /** Marks the bot running and starts renewing the lease. @internal */
  private markRunning(): void {
    this.running = true
    // Never stack a second renewal timer on one already running.
    if (this.renewTimer) {
      clearInterval(this.renewTimer)
    }
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
