"use server"

import { requireAdmin } from "@/lib/admin"
import { ServiceType as PrismaServiceType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  plexServerSchema,
  tautulliSchema,
  overseerrSchema,
  sonarrSchema,
  radarrSchema,
  type PlexConfig,
  type ApiKeyConfig,
} from "@/lib/validations/service"

/**
 * Update Plex server configuration (admin only)
 */
export async function updatePlexServer(data: { name: string; url: string; token: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { testPlexConnection } = await import("@/lib/connections/plex")
    const { getPlexUserInfo } = await import("@/lib/connections/plex")
    const { revalidatePath } = await import("next/cache")

    const validated = plexServerSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testPlexConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Plex server" }
    }

    // Fetch the admin's Plex user ID from the token
    const userInfoResult = await getPlexUserInfo(validated.token)
    if (!userInfoResult.success || !userInfoResult.data) {
      return { success: false, error: "Failed to fetch user info from Plex token" }
    }

    const adminPlexUserId = userInfoResult.data.id

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.service.updateMany({
        where: { type: PrismaServiceType.PLEX, isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.service.findFirst({
        where: {
          type: PrismaServiceType.PLEX,
          url: validated.url,
        },
      })

      const config: PlexConfig = {
        token: validated.token,
        adminPlexUserId,
      }

      if (existing) {
        await tx.service.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      } else {
        await tx.service.create({
          data: {
            type: PrismaServiceType.PLEX,
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Plex server configuration" }
  }
}

/**
 * Update Tautulli configuration (admin only)
 */
export async function updateTautulli(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { testTautulliConnection } = await import("@/lib/connections/tautulli")
    const { revalidatePath } = await import("next/cache")

    const validated = tautulliSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testTautulliConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Tautulli server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.service.updateMany({
        where: { type: PrismaServiceType.TAUTULLI, isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.service.findFirst({
        where: {
          type: PrismaServiceType.TAUTULLI,
          url: validated.url,
        },
      })

      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

      if (existing) {
        await tx.service.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      } else {
        await tx.service.create({
          data: {
            type: PrismaServiceType.TAUTULLI,
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Tautulli configuration" }
  }
}

/**
 * Update Overseerr configuration (admin only)
 */
export async function updateOverseerr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { testOverseerrConnection } = await import("@/lib/connections/overseerr")
    const { revalidatePath } = await import("next/cache")

    const validated = overseerrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testOverseerrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Overseerr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.service.updateMany({
        where: { type: PrismaServiceType.OVERSEERR, isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.service.findFirst({
        where: {
          type: PrismaServiceType.OVERSEERR,
          url: validated.url,
        },
      })

      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

      if (existing) {
        await tx.service.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      } else {
        await tx.service.create({
          data: {
            type: PrismaServiceType.OVERSEERR,
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Overseerr configuration" }
  }
}

/**
 * Update Sonarr configuration (admin only)
 */
export async function updateSonarr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { testSonarrConnection } = await import("@/lib/connections/sonarr")
    const { revalidatePath } = await import("next/cache")

    const validated = sonarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testSonarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Sonarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.service.updateMany({
        where: { type: PrismaServiceType.SONARR, isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.service.findFirst({
        where: {
          type: PrismaServiceType.SONARR,
          url: validated.url,
        },
      })

      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

      if (existing) {
        await tx.service.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      } else {
        await tx.service.create({
          data: {
            type: PrismaServiceType.SONARR,
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Sonarr configuration" }
  }
}

/**
 * Update Radarr configuration (admin only)
 */
export async function updateRadarr(data: { name: string; url: string; apiKey: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { testRadarrConnection } = await import("@/lib/connections/radarr")
    const { revalidatePath } = await import("next/cache")

    const validated = radarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testRadarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Radarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.service.updateMany({
        where: { type: PrismaServiceType.RADARR, isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.service.findFirst({
        where: {
          type: PrismaServiceType.RADARR,
          url: validated.url,
        },
      })

      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

      if (existing) {
        await tx.service.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      } else {
        await tx.service.create({
          data: {
            type: PrismaServiceType.RADARR,
            name: validated.name,
            url: validated.url,
            publicUrl: validated.publicUrl,
            config,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Radarr configuration" }
  }
}
