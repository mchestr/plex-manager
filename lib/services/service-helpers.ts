/**
 * Service Helpers - Type-safe access to the unified Service table
 *
 * This module provides helper functions for querying and managing services
 * from the unified Service table with proper type safety.
 */

import { prisma } from "@/lib/prisma"
import type { Service, ServiceType as PrismaServiceType } from "@/lib/generated/prisma/client"
import {
  ServiceType,
  getPlexConfig,
  getApiKeyConfig,
  getLLMProviderConfig,
  getDiscordConfig,
  type PlexConfig,
  type ApiKeyConfig,
  type LLMProviderConfig,
  type DiscordConfig,
} from "@/lib/validations/service"

// Re-export types for convenience
export { ServiceType }
export type { PlexConfig, ApiKeyConfig, LLMProviderConfig, DiscordConfig }

// Type aliases for service records with typed config
export type PlexService = Service & { config: PlexConfig }
export type TautulliService = Service & { config: ApiKeyConfig }
export type OverseerrService = Service & { config: ApiKeyConfig }
export type SonarrService = Service & { config: ApiKeyConfig }
export type RadarrService = Service & { config: ApiKeyConfig }
export type LLMProviderService = Service & { config: LLMProviderConfig }
export type DiscordService = Service & { config: DiscordConfig }

/**
 * Get the active Plex service
 */
export async function getActivePlexService(): Promise<PlexService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "PLEX" as PrismaServiceType, isActive: true },
  })
  if (!service) return null

  return {
    ...service,
    config: getPlexConfig(service),
  }
}

/**
 * Get the active Tautulli service
 */
export async function getActiveTautulliService(): Promise<TautulliService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "TAUTULLI" as PrismaServiceType, isActive: true },
  })
  if (!service) return null

  return {
    ...service,
    config: getApiKeyConfig(service),
  }
}

/**
 * Get the active Overseerr service
 */
export async function getActiveOverseerrService(): Promise<OverseerrService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "OVERSEERR" as PrismaServiceType, isActive: true },
  })
  if (!service) return null

  return {
    ...service,
    config: getApiKeyConfig(service),
  }
}

/**
 * Get the active Sonarr service
 */
export async function getActiveSonarrService(): Promise<SonarrService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "SONARR" as PrismaServiceType, isActive: true },
  })
  if (!service) return null

  return {
    ...service,
    config: getApiKeyConfig(service),
  }
}

/**
 * Get the active Radarr service
 */
export async function getActiveRadarrService(): Promise<RadarrService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "RADARR" as PrismaServiceType, isActive: true },
  })
  if (!service) return null

  return {
    ...service,
    config: getApiKeyConfig(service),
  }
}

/**
 * Get the active LLM provider by purpose
 */
export async function getActiveLLMProvider(
  purpose: "chat" | "wrapped"
): Promise<LLMProviderService | null> {
  const services = await prisma.service.findMany({
    where: { type: "LLM_PROVIDER" as PrismaServiceType, isActive: true },
  })

  // Find the one with matching purpose in config
  for (const service of services) {
    try {
      const config = getLLMProviderConfig(service)
      if (config.purpose === purpose) {
        return { ...service, config }
      }
    } catch {
      // Config doesn't match expected schema, skip
      continue
    }
  }

  return null
}

/**
 * Get the Discord service (singleton)
 */
export async function getDiscordService(): Promise<DiscordService | null> {
  const service = await prisma.service.findFirst({
    where: { type: "DISCORD" as PrismaServiceType },
  })
  if (!service) return null

  return {
    ...service,
    config: getDiscordConfig(service),
  }
}

/**
 * Get all services of a specific type
 */
export async function getServicesByType(type: PrismaServiceType): Promise<Service[]> {
  return prisma.service.findMany({
    where: { type },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Upsert a service - creates or updates based on type and optional purpose (for LLM)
 * Automatically deactivates other services of the same type when setting active
 */
export async function upsertService<T extends object>({
  type,
  name,
  url,
  publicUrl,
  config,
  isActive = true,
  purpose,
}: {
  type: PrismaServiceType
  name: string
  url?: string | null
  publicUrl?: string | null
  config: T
  isActive?: boolean
  purpose?: "chat" | "wrapped" // Only for LLM_PROVIDER type
}): Promise<Service> {
  return prisma.$transaction(async (tx) => {
    // Deactivate other services of the same type if this one is active
    if (isActive) {
      if (type === "LLM_PROVIDER" && purpose) {
        // For LLM providers, only deactivate services with the same purpose
        const existingServices = await tx.service.findMany({
          where: { type, isActive: true },
        })
        for (const existing of existingServices) {
          try {
            const existingConfig = getLLMProviderConfig(existing)
            if (existingConfig.purpose === purpose) {
              await tx.service.update({
                where: { id: existing.id },
                data: { isActive: false },
              })
            }
          } catch {
            continue
          }
        }
      } else if (type === "DISCORD") {
        // Discord is a singleton, no deactivation needed
      } else {
        // For other types, deactivate all active services
        await tx.service.updateMany({
          where: { type, isActive: true },
          data: { isActive: false },
        })
      }
    }

    // For Discord, use upsert with known ID pattern
    if (type === "DISCORD") {
      return tx.service.upsert({
        where: { id: "discord" },
        create: {
          id: "discord",
          type,
          name,
          url,
          publicUrl,
          config: config as object,
          isActive,
        },
        update: {
          name,
          url,
          publicUrl,
          config: config as object,
          isActive,
        },
      })
    }

    // For other types, create new record
    return tx.service.create({
      data: {
        type,
        name,
        url,
        publicUrl,
        config: config as object,
        isActive,
      },
    })
  })
}

/**
 * Update an existing service by ID
 */
export async function updateService<T extends object>(
  id: string,
  data: {
    name?: string
    url?: string | null
    publicUrl?: string | null
    config?: T
    isActive?: boolean
  }
): Promise<Service> {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({ where: { id } })
    if (!service) {
      throw new Error(`Service not found: ${id}`)
    }

    // If setting to active, deactivate others of same type
    if (data.isActive === true) {
      if (service.type === "LLM_PROVIDER" && data.config) {
        // For LLM providers, only deactivate services with the same purpose
        const newConfig = getLLMProviderConfig({ type: service.type, config: data.config })
        const existingServices = await tx.service.findMany({
          where: { type: service.type, isActive: true, id: { not: id } },
        })
        for (const existing of existingServices) {
          try {
            const existingConfig = getLLMProviderConfig(existing)
            if (existingConfig.purpose === newConfig.purpose) {
              await tx.service.update({
                where: { id: existing.id },
                data: { isActive: false },
              })
            }
          } catch {
            continue
          }
        }
      } else if (service.type !== "DISCORD") {
        await tx.service.updateMany({
          where: { type: service.type, isActive: true, id: { not: id } },
          data: { isActive: false },
        })
      }
    }

    return tx.service.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.publicUrl !== undefined && { publicUrl: data.publicUrl }),
        ...(data.config !== undefined && { config: data.config as object }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })
  })
}

/**
 * Helper to convert legacy service records to Service table format
 * Useful for backwards compatibility during migration
 */
export function toLegacyPlexServer(service: PlexService | null) {
  if (!service) return null
  return {
    id: service.id,
    name: service.name,
    url: service.url ?? "",
    publicUrl: service.publicUrl,
    token: service.config.token,
    adminPlexUserId: service.config.adminPlexUserId ?? null,
    isActive: service.isActive,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  }
}

export function toLegacyApiKeyService(service: (TautulliService | OverseerrService | SonarrService | RadarrService) | null) {
  if (!service) return null
  return {
    id: service.id,
    name: service.name,
    url: service.url ?? "",
    publicUrl: service.publicUrl,
    apiKey: service.config.apiKey,
    isActive: service.isActive,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  }
}

export function toLegacyLLMProvider(service: LLMProviderService | null) {
  if (!service) return null
  return {
    id: service.id,
    provider: service.config.provider,
    purpose: service.config.purpose,
    apiKey: service.config.apiKey,
    model: service.config.model ?? "",
    temperature: service.config.temperature ?? null,
    maxTokens: service.config.maxTokens ?? null,
    isActive: service.isActive,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  }
}

export function toLegacyDiscordIntegration(service: DiscordService | null) {
  if (!service) return null
  return {
    id: service.id,
    isEnabled: service.config.isEnabled ?? false,
    botEnabled: service.config.botEnabled ?? false,
    clientId: service.config.clientId ?? null,
    clientSecret: service.config.clientSecret ?? null,
    guildId: service.config.guildId ?? null,
    serverInviteCode: service.config.serverInviteCode ?? null,
    platformName: service.config.platformName ?? "Plex Wrapped",
    instructions: service.config.instructions ?? null,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
    updatedBy: null,
  }
}
