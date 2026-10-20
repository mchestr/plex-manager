/**
 * The redemption steps the Plex and Jellyfin invite paths share: the atomic
 * validate-and-use transaction, its conflict retry, and the compensating
 * rollback of a use.
 *
 * @module lib/invites/redemption
 */

import "server-only"

import { Prisma, ServerType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("INVITE")

const TRANSACTION_TIMEOUT_MS = 10000

// Retry configuration for transaction conflicts
const MAX_TRANSACTION_RETRIES = 3
const INITIAL_RETRY_DELAY_MS = 100

// Redeeming an invite is admin-granted membership, so the user is marked exempt
// from the Stripe subscription gate — same semantics as the admin "Grant access"
// comp action. Applied only when the user is not already exempt, so an existing
// exemptReason (e.g. "grandfathered", "comp") is never overwritten.
export const INVITE_EXEMPTION = { isExempt: true, exemptReason: "invite" }

/**
 * Check if an error is a Prisma transaction conflict (P2034)
 */
function isTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034"
  }
  return false
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with exponential backoff retry on transaction conflicts
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelayMs?: number
    onConflict?: (attempt: number) => void
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_TRANSACTION_RETRIES
  const initialDelay = options.initialDelayMs ?? INITIAL_RETRY_DELAY_MS

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (!isTransactionConflict(error) || attempt >= maxRetries) {
        throw error
      }

      // Log transaction conflict for monitoring
      options.onConflict?.(attempt + 1)

      // Exponential backoff with jitter
      const delay = initialDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5)
      logger.warn("Transaction conflict, retrying", {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delay),
      })
      await sleep(delay)
    }
  }

  throw lastError
}

// Types for invite with full data
interface InviteData {
  id: string
  code: string
  serverType: ServerType
  maxUses: number
  useCount: number
  expiresAt: Date | null
  // Plex-specific
  librarySectionIds: string | null
  allowDownloads: boolean
  // Jellyfin-specific
  jellyfinLibraryIds: string | null
}

/** Typed error codes a redemption returns, all of them `ActionErrorCode`s. */
type InviteErrorCode = "INVITE_WRONG_SERVICE" | "INVITE_INVALID" | "INTERNAL"

type ValidateAndUseResult =
  | { success: true; invite: InviteData }
  | { success: false; code: InviteErrorCode; error: string }

const SERVER_LABELS: Record<ServerType, string> = {
  [ServerType.PLEX]: "Plex",
  [ServerType.JELLYFIN]: "Jellyfin",
}

/**
 * Rollback invite usage by decrementing the use count.
 * Used as a compensating transaction when a redemption fails after the invite
 * was consumed. The `useCount > 0` guard keeps a double compensation from
 * taking the count below zero.
 */
export async function rollbackInviteUsage(
  inviteId: string,
  plexUserEmail: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.invite.updateMany({
      where: { id: inviteId, useCount: { gt: 0 } },
      data: { useCount: { decrement: 1 } },
    })

    logger.info("Invite usage rolled back successfully", {
      inviteId,
      plexUserEmail,
      reason,
    })

    // Audit log the rollback
    logAuditEvent(AuditEventType.INVITE_ROLLBACK, "system", {
      inviteId,
      plexUserEmail,
      reason,
    })

    return { success: true }
  } catch (error) {
    const errorMessage = String(error)

    logger.error("Failed to rollback invite usage", error, {
      inviteId,
      plexUserEmail,
      reason,
    })

    // Audit log the failed rollback - this is a critical issue
    logAuditEvent(AuditEventType.INVITE_ROLLBACK_FAILED, "system", {
      inviteId,
      plexUserEmail,
      reason,
      rollbackError: errorMessage,
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Atomically validate and use an invite within a single transaction.
 * Uses Serializable isolation level to prevent TOCTOU race conditions.
 * This ensures that concurrent requests cannot both pass validation.
 * An invite for another service is rejected before its use is counted, so a
 * Jellyfin code never reaches the Plex share or the invite exemption (SEC-29).
 * Note: This function re-throws P2034 transaction conflicts for retry handling
 */
export async function validateAndUseInvite(
  code: string,
  expectedServerType: ServerType
): Promise<ValidateAndUseResult> {
  try {
    const result = await prisma.$transaction(
      async (tx): Promise<ValidateAndUseResult> => {
        // Find invite by code inside the transaction
        const invite = await tx.invite.findUnique({
          where: { code },
        })

        if (!invite) {
          return { success: false, code: "INVITE_INVALID", error: "Invalid invite code" }
        }

        if (invite.serverType !== expectedServerType) {
          return {
            success: false,
            code: "INVITE_WRONG_SERVICE",
            error: `This invite is for ${SERVER_LABELS[invite.serverType]}`,
          }
        }

        // Validate expiration
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          return { success: false, code: "INVITE_INVALID", error: "Invite has expired" }
        }

        // Validate max uses
        if (invite.useCount >= invite.maxUses) {
          return { success: false, code: "INVITE_INVALID", error: "Invite has reached maximum uses" }
        }

        // Atomically increment the use count
        const updatedInvite = await tx.invite.update({
          where: { id: invite.id },
          data: { useCount: { increment: 1 } },
        })

        return {
          success: true,
          invite: {
            id: updatedInvite.id,
            code: updatedInvite.code,
            serverType: updatedInvite.serverType,
            maxUses: updatedInvite.maxUses,
            useCount: updatedInvite.useCount,
            expiresAt: updatedInvite.expiresAt,
            librarySectionIds: updatedInvite.librarySectionIds,
            allowDownloads: updatedInvite.allowDownloads,
            jellyfinLibraryIds: updatedInvite.jellyfinLibraryIds,
          },
        }
      },
      {
        timeout: TRANSACTION_TIMEOUT_MS,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )

    return result
  } catch (error) {
    // Re-throw P2034 errors for retry handling at the caller level
    if (isTransactionConflict(error)) {
      throw error
    }
    logger.error("Error validating and using invite", error, { inviteCodePrefix: code.slice(0, 2) })
    return { success: false, code: "INTERNAL", error: "Failed to process invite" }
  }
}
