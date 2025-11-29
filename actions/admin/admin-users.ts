"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ADMIN")

/**
 * Get user by ID (admin only)
 */
export async function getUserById(userId: string) {
  await requireAdmin()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  })

  return user
}

/**
 * Update user admin status (admin only)
 */
export async function updateUserAdminStatus(userId: string, isAdmin: boolean) {
  const session = await requireAdmin()

  try {
    // Prevent users from removing their own admin status
    if (session.user.id === userId && !isAdmin) {
      return {
        success: false,
        error: "You cannot remove your own admin privileges",
      }
    }

    // Get current user to check if status is changing
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    })

    if (!currentUser) {
      return {
        success: false,
        error: "User not found",
      }
    }

    // Only update if status is actually changing
    if (currentUser.isAdmin === isAdmin) {
      return {
        success: true,
        message: `User is already ${isAdmin ? "an admin" : "a regular user"}`,
      }
    }

    // Update user admin status
    await prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
    })

    // Log audit event
    const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
    logAuditEvent(
      isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
      session.user.id,
      {
        targetUserId: userId,
        previousAdminStatus: !isAdmin,
        newAdminStatus: isAdmin,
      }
    )

    const { revalidatePath } = await import("next/cache")
    revalidatePath(`/admin/users/${userId}`)
    revalidatePath("/admin/users")

    return { success: true }
  } catch (error) {
    logger.error("Error updating user admin status", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update user admin status",
    }
  }
}
