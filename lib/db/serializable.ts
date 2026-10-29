/**
 * Serializable transactions with a retry on conflict. Postgres aborts one of
 * two Serializable transactions that read and write the same rows, and Prisma
 * reports it as P2034; the retry runs the whole body again on fresh reads.
 *
 * @module lib/db/serializable
 */

import "server-only"

import { Prisma } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("DB")

const TRANSACTION_TIMEOUT_MS = 10000
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 100

/** Whether the error is a Prisma transaction conflict (P2034). */
export function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Runs `fn` in a Serializable transaction, and again (up to three retries,
 * with exponential backoff and jitter) when it conflicts with another one. A
 * conflict on the last attempt is thrown; any other error is thrown at once.
 *
 * @param fn - The transaction body; it can run more than once.
 * @param options.onConflict - Told the attempt number before each retry.
 */
export async function inSerializable<T>(
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  options: { onConflict?: (attempt: number) => void } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout: TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!isTransactionConflict(error) || attempt >= MAX_RETRIES) throw error
      options.onConflict?.(attempt + 1)
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5)
      logger.warn("Transaction conflict, retrying", { attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: Math.round(delay) })
      await sleep(delay)
    }
  }
}
