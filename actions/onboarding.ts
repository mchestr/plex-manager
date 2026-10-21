"use server"

import { memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { AuthService } from "@/types/onboarding"
import { z } from "zod"

const logger = createLogger("ONBOARDING")

/**
 * Zod schema for onboarding status
 * Validates the onboardingStatus JSON field from the database
 */
const OnboardingStatusSchema = z.object({
  plex: z.boolean(),
  jellyfin: z.boolean(),
})

/**
 * Valid auth services. Used to validate the `service` argument before it is
 * used as an object key written to the DB, since the AuthService TypeScript
 * type is erased at runtime.
 */
const AuthServiceSchema = z.enum(["plex", "jellyfin"])

interface OnboardingStatusRecord {
  plex: boolean
  jellyfin: boolean
}

/**
 * Whether the signed-in user has completed onboarding for a service.
 *
 * @param input - `{ service }`, the auth service ("plex" or "jellyfin"); when
 *   omitted, the user's primaryAuthService
 */
export const getOnboardingStatus = memberAction({
  input: z.object({ service: AuthServiceSchema.optional() }).optional(),
  fallbackError: "Failed to check onboarding status",
  handler: async (input, { userId }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingStatus: true,
        primaryAuthService: true,
      },
    })

    const validation = OnboardingStatusSchema.safeParse(user?.onboardingStatus)
    const status: OnboardingStatusRecord = validation.success
      ? validation.data
      : { plex: false, jellyfin: false }

    // If no service specified, use primary auth service
    const targetService: AuthService = input?.service || (user?.primaryAuthService as AuthService) || "plex"

    return ok({
      isComplete: status[targetService] || false,
      service: targetService,
      allStatuses: status,
    })
  },
})

/**
 * Mark onboarding as complete for a specific service
 *
 * @param input - `{ service }`, the auth service ("plex" or "jellyfin")
 */
export const completeOnboarding = memberAction({
  // Validated before it is used as a persisted object key
  input: z.object({ service: AuthServiceSchema }),
  fallbackError: "Failed to complete onboarding",
  handler: async ({ service }, { userId }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingStatus: true },
    })

    const validation = OnboardingStatusSchema.safeParse(user?.onboardingStatus)
    const currentStatus: OnboardingStatusRecord = validation.success
      ? validation.data
      : { plex: false, jellyfin: false }

    await prisma.user.update({
      where: { id: userId },
      data: { onboardingStatus: { ...currentStatus, [service]: true } },
    })

    logger.info("Onboarding completed", { userId, service })

    return ok(null)
  },
})
