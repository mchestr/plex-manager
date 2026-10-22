import { createLogger } from "@/lib/utils/logger"
import type { LeaseLock } from "./lease-lock"

const logger = createLogger("LEASE_POLLER")

/**
 * How often the poll loop ticks (acquire, re-check enabled, config bounce,
 * held tick). Renewal runs on its own timer, so this only bounds how quickly a
 * free lease is picked up and a settings change is applied.
 */
export const DEFAULT_POLL_INTERVAL_MS = 10 * 1000

export interface LeasePollerCallbacks {
  /** Fired once when the lease is acquired and the work should start. */
  onLockAcquired: () => Promise<void>
  /** Fired once when the lease is lost or the work is disabled and should stop. */
  onLockLost: () => Promise<void>
  /** Whether the work is enabled. Checked every tick. */
  isEnabled: () => Promise<boolean>
  /**
   * Runs on every poll while the lease is held, the acquiring poll included,
   * after any config bounce. Keep it short: a long run belongs in a promise it
   * starts and does not await, or it holds up the next tick.
   */
  onHeldTick?: () => Promise<void>
}

export interface LeasePollerOptions {
  /** How often to run the poll loop. Defaults to {@link DEFAULT_POLL_INTERVAL_MS}. */
  pollIntervalMs?: number
  /**
   * How often to renew the lease while the work runs. Defaults to a third of
   * the lock's lease (10 s for the default 30 s lease). It must be a finite
   * number above 0 and below half the lease, so one late or skipped renewal
   * still leaves time for the next before the lease lapses; the constructor
   * throws otherwise (BP-12). A renewal that fails is not retried: it ends the run.
   */
  renewIntervalMs?: number
  /**
   * Reads the current config version (the Discord bot bumps it whenever the
   * token or support config changes). When given, a change while the lease is
   * held bounces the work: onLockLost, then onLockAcquired (Step 18 / FR-13).
   * Without it there is no bounce.
   */
  getConfigVersion?: () => Promise<number>
}

/**
 * # LeasePoller
 *
 * Owns the background loops that run one piece of work under one
 * {@link LeaseLock}: the Discord bot, or the watchlist sync without Redis.
 *
 * ## Two timers, one lock
 *
 * - The **poll** timer (`pollIntervalMs`) acquires the lease while the work is
 *   not running, re-checks the enabled flag, bounces the work on a config
 *   change, and runs `onHeldTick` while the lease is held.
 * - The **renewal** timer (`renewIntervalMs`, a third of the lease by default)
 *   runs only while the work runs, and only renews the lease.
 *
 * Renewal used to ride on the poll tick, so a poll interval longer than the
 * lease (the old 60 s default against the 30 s lease) let the lease lapse
 * between ticks and the bot dropped offline every minute (BP-12). Renewal now
 * starts the moment the lease is acquired, before the work starts (a bot login
 * takes seconds), and keeps running through a config bounce.
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
 *       if getConfigVersion given:                  # Step 18 (FR-13)
 *           current = await getConfigVersion()
 *           if running and current != lastConfigVersion:
 *               queue: onLockLost(); onLockAcquired()   # each only while running
 *               lastConfigVersion = current              # only if the re-init ran
 *               on failure -> stop renewal; release()    # next tick re-acquires
 *   else:
 *       version = await getConfigVersion?()         # before acquire: a failed read takes nothing
 *       if await lock.acquire():
 *           if stopped meanwhile -> release(); return
 *           lastConfigVersion = version; start renewal; queue: onLockAcquired() while running
 *
 *   if running: await onHeldTick?()
 * ```
 *
 * ## Ending a run
 *
 * Four paths end a run: disable, a failed bounce, a lost renewal and `stop()`.
 * Whichever sets `running` to false first tears the work down. A lifecycle
 * callback queued before that (a bounce, or a login waiting behind a slow
 * teardown) re-checks `running` and skips its re-init, so the work never comes
 * back up without the lease, and `onHeldTick` stops at once.
 *
 * ## Renewal tick
 *
 * ```
 * every renewIntervalMs while running (skipped while a renewal is in flight):
 *   if !(await lock.renew()) and still running -> stop renewal; onLockLost()
 * ```
 */
export class LeasePoller {
  private readonly lock: LeaseLock
  private readonly callbacks: LeasePollerCallbacks
  private readonly pollIntervalMs: number
  private readonly renewIntervalMs: number
  private readonly getConfigVersion?: () => Promise<number>

  private timer?: ReturnType<typeof setInterval>
  private renewTimer?: ReturnType<typeof setInterval>
  private polling = false
  /**
   * Guards against overlapping ticks: if a tick's async work (acquire / bounce)
   * outlasts the poll interval, the next interval fire is skipped rather than
   * running concurrently against the same lock and work state.
   */
  private ticking = false
  /** Skips a renewal fire while the previous renewal is still in flight. */
  private renewing = false
  /** True once onLockAcquired has fired and not yet been undone by onLockLost. */
  private running = false
  /**
   * The config version the running work was started with. A later tick seeing
   * a different version bounces the work to pick up fresh config.
   */
  private lastConfigVersion = 0
  /** Tail of the lifecycle-callback queue (see {@link runLifecycle}). */
  private lifecycle: Promise<void> = Promise.resolve()

  constructor(lock: LeaseLock, callbacks: LeasePollerCallbacks, options: LeasePollerOptions = {}) {
    const leaseDurationMs = lock.getLeaseDurationMs()
    const renewIntervalMs = options.renewIntervalMs ?? Math.floor(leaseDurationMs / 3)
    // NaN, 0 or a negative interval would make setInterval fire every ~1 ms.
    if (!Number.isFinite(renewIntervalMs) || renewIntervalMs <= 0 || renewIntervalMs >= leaseDurationMs / 2) {
      throw new Error(
        `Lease renewal interval (${renewIntervalMs} ms) must be above 0 and less than half the lease (${leaseDurationMs} ms)`
      )
    }

    this.lock = lock
    this.callbacks = callbacks
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.renewIntervalMs = renewIntervalMs
    this.getConfigVersion = options.getConfigVersion
  }

  /**
   * Begins polling. Attempts an immediate acquire (if enabled) then installs the
   * recurring poll tick. Idempotent: a second call while already polling is a
   * no-op.
   */
  async start(): Promise<void> {
    if (this.polling) {
      logger.debug("Lease polling already started", { name: this.lock.name })
      return
    }

    this.polling = true
    logger.debug(
      `Starting lease polling for ${this.lock.name} (every ${this.pollIntervalMs / 1000} seconds, renewing every ${this.renewIntervalMs / 1000} seconds)`
    )

    // Try immediately on startup so a free lease is taken without waiting a tick.
    try {
      if (await this.callbacks.isEnabled()) {
        await this.acquireAndStart("on startup")
        await this.heldTick()
      } else {
        logger.debug("Disabled - not acquiring the lease on startup", { name: this.lock.name })
      }
    } catch (error) {
      logger.debug("Error during initial lease acquisition", { name: this.lock.name, error })
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
   * One iteration of the poll loop.
   *
   * @internal
   */
  private async tick(): Promise<void> {
    if (!this.polling) {
      return
    }

    // Skip if a previous tick is still in flight (its awaits outlasted the poll
    // interval); overlapping ticks would race on the shared lock and work state.
    if (this.ticking) {
      logger.debug("Previous lease tick still in progress - skipping this tick", { name: this.lock.name })
      return
    }
    this.ticking = true

    try {
      if (!(await this.callbacks.isEnabled())) {
        if (this.running) {
          logger.debug("Disabled - stopping the work and releasing the lease", { name: this.lock.name })
          this.markStopped()
          await this.runLifecycle(() => this.callbacks.onLockLost())
          await this.lock.release()
        }
        return
      }

      if (this.running) {
        await this.bounceIfConfigChanged()
      } else {
        await this.acquireAndStart("during polling")
      }
      await this.heldTick()
    } catch (error) {
      logger.debug("Error during lease polling", { name: this.lock.name, error })
    } finally {
      this.ticking = false
    }
  }

  /** Runs `onHeldTick` while the work runs under the lease. @internal */
  private async heldTick(): Promise<void> {
    if (this.running && this.callbacks.onHeldTick) {
      await this.callbacks.onHeldTick()
    }
  }

  /**
   * Takes the lease and starts the work, if the lease is free.
   *
   * The config version is read before the acquire. Read after it, a failed read
   * left the lease held and renewed with no bot logged in, so no pod could run
   * the bot until a restart. Now a failed read takes nothing and the next tick
   * retries.
   *
   * @internal
   */
  private async acquireAndStart(when: "on startup" | "during polling"): Promise<void> {
    const configVersion = this.getConfigVersion ? await this.getConfigVersion() : 0
    if (!(await this.lock.acquire())) {
      return
    }

    if (!this.polling) {
      logger.debug("Lease polling stopped while acquiring - releasing the lease", { name: this.lock.name })
      await this.lock.release()
      return
    }

    logger.debug(`Lease acquired ${when} - starting`, { name: this.lock.name })
    this.lastConfigVersion = configVersion
    // Renew from now on: a login can take seconds.
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
   * Step 18 (FR-13): config-change / token-rotation bounce, only when
   * `getConfigVersion` was given.
   *
   * Only the lease HOLDER calls this, so only the holder bounces. If the config
   * version changed since the work started, it re-initializes in place (the
   * bot logs in with the fresh token). The lease is kept across the bounce, and
   * the renewal timer keeps it alive meanwhile.
   *
   * A renewal can be lost, or stop() can run, during the version read or while
   * the bounce waits in the lifecycle queue. Their teardown is then queued or
   * done, so the bounce skips the re-init: otherwise the work would come back
   * up with no lease, and nothing would tear it down.
   *
   * @internal
   */
  private async bounceIfConfigChanged(): Promise<void> {
    if (!this.getConfigVersion) {
      return
    }
    const currentConfigVersion = await this.getConfigVersion()
    if (!this.running || currentConfigVersion === this.lastConfigVersion) {
      return
    }

    logger.info("Config changed - bouncing to apply it", {
      name: this.lock.name,
      from: this.lastConfigVersion,
      to: currentConfigVersion,
    })
    try {
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
      logger.error("Failed to re-initialize after a config change - releasing the lease", {
        name: this.lock.name,
        error,
      })
      this.markStopped()
      await this.lock.release()
    }
  }

  /**
   * One renewal: extends the lease off the same lock object. A failed renewal
   * means the lease is gone, so the work stops and the poll loop re-acquires.
   *
   * @internal
   */
  private async renewLease(): Promise<void> {
    if (this.renewing) {
      logger.debug("Previous lease renewal still in progress - skipping this renewal", { name: this.lock.name })
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
      logger.debug("Lease renewal failed - stopping the work", { name: this.lock.name })
      this.markStopped()
      await this.runLifecycle(() => this.callbacks.onLockLost())
    } catch (error) {
      logger.debug("Error stopping the work after a failed lease renewal", { name: this.lock.name, error })
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

  /** Marks the work running and starts renewing the lease. @internal */
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

  /** Marks the work stopped and stops renewing the lease. @internal */
  private markStopped(): void {
    this.running = false
    if (this.renewTimer) {
      clearInterval(this.renewTimer)
      this.renewTimer = undefined
    }
  }

  /**
   * Stops polling, clears both timers, and — if the work was running — fires
   * onLockLost and releases the lease. Idempotent.
   */
  async stop(): Promise<void> {
    if (!this.polling) {
      return
    }

    logger.debug("Stopping lease polling", { name: this.lock.name })
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
      logger.debug("Error during the lock-lost callback on stop", { name: this.lock.name, error })
    }
    await this.lock.release()
  }
}
