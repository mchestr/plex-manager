/**
 * The claims of media cleanup (TS 8.1, E10, E26): three columns of the
 * settings row, so at most one library read, one live or act run, and one
 * Plex collection sync run at a time. A copy of the claim in
 * `lib/inactivity/run.ts`. Server-only.
 *
 * | Claim | Column | Taken by |
 * |---|---|---|
 * | Read | `readClaimAt` | `cleanup:read` |
 * | Run | `runClaimAt` | a live `cleanup:run`, every `cleanup:act`, and the actions that write many items |
 * | Collections | `collectionsClaimAt` | `cleanup:collections` |
 *
 * 1. `claim(column, now)`: upsert the row, then set the column to `now`
 *    where it is null or stale. Zero rows: busy.
 * 2. Every 5 minutes: set the column to the time, where it still holds this
 *    claim's value. One row: keep the new value. Zero rows: another holder
 *    took it over, so abort `lost`.
 * 3. `release`: stop renewing, wait for a renewal in flight, then clear the
 *    column where it still holds this claim's value.
 *
 * A claim not renewed for {@link CLAIM_STALE_MS} is stale and taken over, so
 * a crashed job never blocks the next night. The change check before a
 * release of the run claim (TS 8.1 item 7) lives in
 * `lib/cleanup/run/run-claim.ts` (deviation D16), on top of these functions.
 *
 * @module lib/cleanup/claims
 */

import "server-only"

import { CLAIM_RENEW_MS, CLAIM_STALE_MS } from "@/lib/cleanup/constants"
import { CLEANUP_SETTINGS_ID } from "@/lib/cleanup/settings"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_CLAIMS")

/** The claim columns of `CleanupSettings`. */
export const CLAIM_COLUMNS = ["readClaimAt", "runClaimAt", "collectionsClaimAt"] as const
export type ClaimColumn = (typeof CLAIM_COLUMNS)[number]

/** A claim this process holds. Give it up with {@link release}. */
export interface Claim {
  readonly column: ClaimColumn
  /** Aborted when a renewal finds that another holder took the claim over. Stop before the next change. */
  readonly lost: AbortSignal
  /** The value the column holds for this claim: the take, then each renewal. */
  value(): Date
}

interface Holding {
  timer: NodeJS.Timeout
  /** The renewals, one at a time, each on the value the last one set. */
  renewing: Promise<void>
}

const holdings = new WeakMap<Claim, Holding>()
const ID = { id: CLEANUP_SETTINGS_ID }

const columnIs = (column: ClaimColumn, value: Date | null | Prisma.DateTimeNullableFilter): Prisma.CleanupSettingsWhereInput => ({
  ...ID,
  [column]: value,
})
const setColumn = (column: ClaimColumn, value: Date | null): Prisma.CleanupSettingsUpdateManyMutationInput => ({ [column]: value })

/** Whether a stored claim value still holds at `now`: set, and renewed within {@link CLAIM_STALE_MS}. */
export function isClaimHeld(value: Date | null, now: Date = new Date()): boolean {
  return value !== null && value.getTime() >= now.getTime() - CLAIM_STALE_MS
}

/**
 * Renews the claim taken at `taken` every {@link CLAIM_RENEW_MS} until
 * {@link release}. A renewal that matches no row aborts `lost` and stops. A
 * renewal that throws keeps the claim, and the next one tries again with the
 * same value.
 */
export function holdClaim(column: ClaimColumn, taken: Date): Claim {
  let token = taken
  const lost = new AbortController()
  const renew = async () => {
    if (lost.signal.aborted) return
    const next = new Date()
    try {
      const { count } = await prisma.cleanupSettings.updateMany({ where: columnIs(column, token), data: setColumn(column, next) })
      if (count > 0) token = next
      else {
        logger.warn("cleanup.claim_lost", { column })
        lost.abort()
      }
    } catch (error) {
      logger.error("cleanup.claim_renew_failed", error, { column })
    }
  }
  const holding: Holding = {
    timer: setInterval(() => {
      holding.renewing = holding.renewing.then(renew)
    }, CLAIM_RENEW_MS),
    renewing: Promise.resolve(),
  }
  holding.timer.unref()
  const held: Claim = { column, lost: lost.signal, value: () => token }
  holdings.set(held, holding)
  return held
}

/**
 * Takes the claim of `column` at `now`, and holds it ({@link holdClaim}).
 * Null while another holder has a claim that is not stale (busy).
 */
export async function claim(column: ClaimColumn, now: Date = new Date()): Promise<Claim | null> {
  await prisma.cleanupSettings.upsert({ where: ID, create: ID, update: {} })
  const stale = new Date(now.getTime() - CLAIM_STALE_MS)
  const { count } = await prisma.cleanupSettings.updateMany({
    where: { ...ID, OR: [columnIs(column, null), columnIs(column, { lt: stale })] },
    data: setColumn(column, now),
  })
  return count > 0 ? holdClaim(column, now) : null
}

/**
 * Stops the renewals, waits for one in flight, then clears the column where
 * it still holds this claim's value. A claim that another holder took over
 * stays theirs. True when this call cleared the column.
 */
export async function release(held: Claim): Promise<boolean> {
  const holding = holdings.get(held)
  if (holding) {
    holdings.delete(held)
    clearInterval(holding.timer)
    await holding.renewing
  }
  const { count } = await prisma.cleanupSettings.updateMany({ where: columnIs(held.column, held.value()), data: setColumn(held.column, null) })
  return count > 0
}

export type TryClaimResult<T> = { claimed: true; value: T } | { claimed: false }

/**
 * Runs `work` under the claim of `column`, or skips it while the claim is
 * busy (`{ claimed: false }`), for work that must never fail on a busy claim:
 * the exits of a rule save or a protections save (TS 10.3). The claim is
 * given up in all cases, with `options.release` when given (the change
 * check of `run-claim.ts`), else {@link release}. An error of `work` is
 * thrown after the release.
 */
export async function tryClaim<T>(
  column: ClaimColumn,
  work: (held: Claim) => Promise<T>,
  options: { now?: Date; release?: (held: Claim) => Promise<unknown> } = {}
): Promise<TryClaimResult<T>> {
  const held = await claim(column, options.now)
  if (!held) return { claimed: false }
  const giveUp = options.release ?? release
  let value: T
  try {
    value = await work(held)
  } catch (error) {
    await giveUp(held).catch((releaseError: unknown) => logger.error("cleanup.claim_release_failed", releaseError, { column }))
    throw error
  }
  await giveUp(held)
  return { claimed: true, value }
}
