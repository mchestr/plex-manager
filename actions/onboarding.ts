"use server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { AuthService } from "@/types/onboarding"
import { getServerSession } from "next-auth"

const logger = createLogger("ONBOARDING")

interface OnboardingStatusRecord {
  plex: boolean
  jellyfin: boolean
}

/**
 * Check if the current user has completed onboarding for a specific service
 * @param service - The auth service ("plex" or "jellyfin"). If not specified, uses primaryAuthService
 */
export async function getOnboardingStatus(service?: AuthService) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return { isComplete: true, service: service || "plex" } // If not logged in, assume complete to avoid blocking
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingStatus: true,
        primaryAuthService: true,
      },
    })

    const status = (user?.onboardingStatus as unknown as OnboardingStatusRecord) || {
      plex: false,
      jellyfin: false,
    }

    // If no service specified, use primary auth service
    const targetService: AuthService = service || (user?.primaryAuthService as AuthService) || "plex"

    return {
      isComplete: status[targetService] || false,
      service: targetService,
      allStatuses: status,
    }
  } catch (error) {
    logger.error("Error checking onboarding status", error, { service })
    return { isComplete: true, service: service || "plex" } // On error, assume complete to avoid blocking
  }
}

/**
 * Mark onboarding as complete for a specific service
 * @param service - The auth service ("plex" or "jellyfin")
 */
export async function completeOnboarding(service: AuthService) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" }
    }

    // Get current onboarding status
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingStatus: true },
    })

    const currentStatus = (user?.onboardingStatus as unknown as OnboardingStatusRecord) || {
      plex: false,
      jellyfin: false,
    }

    // Update the status for the specified service
    const updatedStatus = {
      ...currentStatus,
      [service]: true,
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingStatus: updatedStatus },
    })

    logger.info("Onboarding completed", { userId: session.user.id, service })

    return { success: true }
  } catch (error) {
    logger.error("Error completing onboarding", error, { service })
    return { success: false, error: "Failed to complete onboarding" }
  }
}

/**
 * Get onboarding configuration info
 */
export async function getOnboardingInfo() {
  try {
    const [overseerr, discordIntegration] = await Promise.all([
      prisma.overseerr.findFirst({
        where: { isActive: true },
        select: {
          publicUrl: true,
          url: true,
        },
      }),
      prisma.discordIntegration.findUnique({
        where: { id: "discord" },
        select: {
          isEnabled: true,
          clientId: true,
          clientSecret: true,
          instructions: true,
        },
      }),
    ])

    let overseerrUrl = null
    if (overseerr) {
      if (overseerr.publicUrl) {
        overseerrUrl = overseerr.publicUrl
      } else {
        // Use internal URL if public URL is not set
        // Note: This might not be reachable from client browser if it's an internal IP/docker hostname
        // but it's better than nothing for now
        overseerrUrl = overseerr.url
      }
    }

    return {
      overseerrUrl,
      discordEnabled: Boolean(discordIntegration?.isEnabled && discordIntegration?.clientId && discordIntegration?.clientSecret),
      discordInstructions: discordIntegration?.instructions ?? null,
    }
  } catch (error) {
    logger.error("Error fetching onboarding info", error)
    return {
      overseerrUrl: null,
      discordEnabled: false,
      discordInstructions: null,
    }
  }
}

