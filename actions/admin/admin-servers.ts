"use server"

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

/**
 * Update Plex server configuration (admin only)
 */
export async function updatePlexServer(data: { name: string; url: string; token: string; publicUrl?: string }) {
  await requireAdmin()

  try {
    const { plexServerSchema } = await import("@/lib/validations/plex")
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
      await tx.plexServer.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.plexServer.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.plexServer.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            token: validated.token,
            publicUrl: validated.publicUrl,
            adminPlexUserId,
            isActive: true,
          },
        })
      } else {
        await tx.plexServer.create({
          data: {
            name: validated.name,
            url: validated.url,
            token: validated.token,
            publicUrl: validated.publicUrl,
            adminPlexUserId,
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
    const { tautulliSchema } = await import("@/lib/validations/tautulli")
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
      await tx.tautulli.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.tautulli.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.tautulli.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.tautulli.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    const { overseerrSchema } = await import("@/lib/validations/overseerr")
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
      await tx.overseerr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.overseerr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.overseerr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.overseerr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    const { sonarrSchema } = await import("@/lib/validations/sonarr")
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
      await tx.sonarr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.sonarr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.sonarr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.sonarr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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
    const { radarrSchema } = await import("@/lib/validations/radarr")
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
      await tx.radarr.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.radarr.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.radarr.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
            isActive: true,
          },
        })
      } else {
        await tx.radarr.create({
          data: {
            name: validated.name,
            url: validated.url,
            apiKey: validated.apiKey,
            publicUrl: validated.publicUrl,
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

/**
 * Update Prometheus configuration (admin only)
 */
export async function updatePrometheus(data: { name: string; url: string; query: string }) {
  await requireAdmin()

  try {
    const { prometheusSchema } = await import("@/lib/validations/prometheus")
    const { testPrometheusConnection, validatePrometheusQuery } = await import(
      "@/lib/connections/prometheus"
    )
    const { revalidatePath } = await import("next/cache")

    const validated = prometheusSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testPrometheusConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Prometheus server" }
    }

    // Validate the PromQL query
    const queryTest = await validatePrometheusQuery(validated)
    if (!queryTest.success) {
      return { success: false, error: queryTest.error || "Invalid PromQL query" }
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate existing active server
      await tx.prometheus.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })

      // Update or create server
      const existing = await tx.prometheus.findFirst({
        where: {
          url: validated.url,
        },
      })

      if (existing) {
        await tx.prometheus.update({
          where: { id: existing.id },
          data: {
            name: validated.name,
            url: validated.url,
            query: validated.query,
            isActive: true,
          },
        })
      } else {
        await tx.prometheus.create({
          data: {
            name: validated.name,
            url: validated.url,
            query: validated.query,
            isActive: true,
          },
        })
      }
    })

    revalidatePath("/admin/settings")
    revalidatePath("/") // Revalidate homepage since status is shown there
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to update Prometheus configuration" }
  }
}

/**
 * Delete Prometheus configuration (admin only)
 */
export async function deletePrometheus() {
  await requireAdmin()

  try {
    const { revalidatePath } = await import("next/cache")

    await prisma.prometheus.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    })

    revalidatePath("/admin/settings")
    revalidatePath("/")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to delete Prometheus configuration" }
  }
}
