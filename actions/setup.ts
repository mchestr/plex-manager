"use server"

import { z } from "zod"
import { requireAdmin } from "@/lib/admin"
import { testLLMProviderConnection } from "@/lib/connections/llm-provider"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { testPlexConnection } from "@/lib/connections/plex"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { ServiceType as PrismaServiceType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  plexServerSchema,
  tautulliSchema,
  overseerrSchema,
  sonarrSchema,
  radarrSchema,
  llmProviderSchema,
  discordIntegrationSchema,
  type PlexServerInput,
  type PlexServerParsed,
  type TautulliInput,
  type TautulliParsed,
  type OverseerrInput,
  type OverseerrParsed,
  type SonarrInput,
  type SonarrParsed,
  type RadarrInput,
  type RadarrParsed,
  type LLMProviderInput,
  type DiscordIntegrationInput,
  type PlexConfig,
  type ApiKeyConfig,
  type LLMProviderConfig,
  type DiscordConfig,
} from "@/lib/validations/service"
import { revalidatePath } from "next/cache"

export async function getSetupStatus() {
  const setup = await prisma.setup.findFirst({
    orderBy: { createdAt: "desc" },
  })

  return {
    isComplete: setup?.isComplete ?? false,
    currentStep: setup?.currentStep ?? 1,
  }
}

export async function savePlexServer(data: PlexServerInput) {
  try {
    // Require admin if setup is already complete
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated: PlexServerParsed = plexServerSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testPlexConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Plex server" }
    }

    // Fetch the admin's Plex user ID from the token
    const { getPlexUserInfo } = await import("@/lib/connections/plex")
    const userInfoResult = await getPlexUserInfo(validated.token)
    if (!userInfoResult.success || !userInfoResult.data) {
      return { success: false, error: "Failed to fetch user info from Plex token" }
    }

    const adminPlexUserId = userInfoResult.data.id

    await prisma.$transaction(async (tx) => {
      // Create or update setup record
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 2,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 2,
          },
        })
      }

      // Deactivate any existing active Plex services
      await tx.service.updateMany({
        where: { type: PrismaServiceType.PLEX, isActive: true },
        data: { isActive: false },
      })

      // Create Plex service in unified Service table
      const config: PlexConfig = {
        token: validated.token,
        adminPlexUserId,
      }

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
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Plex server configuration" }
  }
}

export async function saveTautulli(data: TautulliInput) {
  try {
    // Require admin if setup is already complete
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated: TautulliParsed = tautulliSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testTautulliConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Tautulli server" }
    }

    await prisma.$transaction(async (tx) => {
      // Update setup record
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 3,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 3,
          },
        })
      }

      // Deactivate any existing active Tautulli services
      await tx.service.updateMany({
        where: { type: PrismaServiceType.TAUTULLI, isActive: true },
        data: { isActive: false },
      })

      // Create Tautulli service in unified Service table
      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

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
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Tautulli configuration" }
  }
}

export async function saveOverseerr(data: OverseerrInput) {
  try {
    // Require admin if setup is already complete
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated: OverseerrParsed = overseerrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testOverseerrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Overseerr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Update setup record
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 4,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 4,
          },
        })
      }

      // Deactivate any existing active Overseerr services
      await tx.service.updateMany({
        where: { type: PrismaServiceType.OVERSEERR, isActive: true },
        data: { isActive: false },
      })

      // Create Overseerr service in unified Service table
      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

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
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Overseerr configuration" }
  }
}

export async function saveSonarr(data: SonarrInput) {
  try {
    // Require admin if setup is already complete
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated: SonarrParsed = sonarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testSonarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Sonarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Update setup record
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 5,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 5,
          },
        })
      }

      // Deactivate any existing active Sonarr services
      await tx.service.updateMany({
        where: { type: PrismaServiceType.SONARR, isActive: true },
        data: { isActive: false },
      })

      // Create Sonarr service in unified Service table
      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

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
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Sonarr configuration" }
  }
}

export async function saveRadarr(data: RadarrInput) {
  try {
    // Require admin if setup is already complete
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated: RadarrParsed = radarrSchema.parse(data)

    // Test connection before saving
    const connectionTest = await testRadarrConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Radarr server" }
    }

    await prisma.$transaction(async (tx) => {
      // Update setup record
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 6,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 6,
          },
        })
      }

      // Deactivate any existing active Radarr services
      await tx.service.updateMany({
        where: { type: PrismaServiceType.RADARR, isActive: true },
        data: { isActive: false },
      })

      // Create Radarr service in unified Service table
      const config: ApiKeyConfig = {
        apiKey: validated.apiKey,
      }

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
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Radarr configuration" }
  }
}

export async function saveDiscordIntegration(data: DiscordIntegrationInput) {
  try {
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated = discordIntegrationSchema.parse(data)
    const isEnabled = validated.isEnabled ?? false
    const botEnabled = validated.botEnabled ?? false

    if (isEnabled && (!validated.clientId || !validated.clientSecret)) {
      return {
        success: false,
        error: "Client ID and Client Secret are required when enabling Discord integration",
      }
    }

    await prisma.$transaction(async (tx) => {
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: 7,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 7,
          },
        })
      }

      // Discord config for unified Service table
      const config: DiscordConfig = {
        clientId: validated.clientId,
        clientSecret: validated.clientSecret,
        guildId: validated.guildId,
        serverInviteCode: validated.serverInviteCode,
        platformName: validated.platformName,
        instructions: validated.instructions,
        isEnabled,
        botEnabled,
      }

      // Upsert Discord service (singleton with id="discord")
      await tx.service.upsert({
        where: { id: "discord" },
        update: {
          name: validated.platformName ?? "Discord",
          config,
        },
        create: {
          id: "discord",
          type: PrismaServiceType.DISCORD,
          name: validated.platformName ?? "Discord",
          config,
          isActive: true,
        },
      })
    })

    revalidatePath("/setup")
    revalidatePath("/discord/link")
    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Discord integration" }
  }
}

async function saveLLMProviderForPurpose(
  data: LLMProviderInput,
  purpose: "chat" | "wrapped",
  nextStep: number
) {
  try {
    const setupStatus = await getSetupStatus()
    if (setupStatus.isComplete) {
      await requireAdmin()
    }

    const validated = llmProviderSchema.parse(data)

    const connectionTest = await testLLMProviderConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to LLM provider" }
    }

    await prisma.$transaction(async (tx) => {
      const setup = await tx.setup.findFirst({
        orderBy: { createdAt: "desc" },
      })

      if (setup) {
        await tx.setup.update({
          where: { id: setup.id },
          data: {
            currentStep: nextStep,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: nextStep,
          },
        })
      }

      // Deactivate existing LLM providers with the same purpose
      const existingServices = await tx.service.findMany({
        where: { type: PrismaServiceType.LLM_PROVIDER, isActive: true },
      })

      for (const existing of existingServices) {
        const existingConfig = existing.config as LLMProviderConfig
        if (existingConfig.purpose === purpose) {
          await tx.service.update({
            where: { id: existing.id },
            data: { isActive: false },
          })
        }
      }

      // Create LLM provider service in unified Service table
      const config: LLMProviderConfig = {
        provider: validated.provider,
        purpose,
        apiKey: validated.apiKey,
        model: validated.model || "gpt-4o-mini",
        temperature: validated.temperature ?? undefined,
        maxTokens: validated.maxTokens ?? undefined,
      }

      await tx.service.create({
        data: {
          type: PrismaServiceType.LLM_PROVIDER,
          name: `${validated.provider} (${purpose})`,
          config,
          isActive: true,
        },
      })
    })

    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save LLM provider configuration" }
  }
}

export async function saveChatLLMProvider(data: LLMProviderInput) {
  return saveLLMProviderForPurpose(data, "chat", 8)
}

export async function saveLLMProvider(data: LLMProviderInput) {
  return saveLLMProviderForPurpose(data, "wrapped", 9)
}

export async function completeSetup() {
  // Require admin if setup is already complete
  const setupStatus = await getSetupStatus()
  if (setupStatus.isComplete) {
    await requireAdmin()
  }

  const setup = await prisma.setup.findFirst({
    orderBy: { createdAt: "desc" },
  })

  if (setup) {
    await prisma.setup.update({
      where: { id: setup.id },
      data: {
        isComplete: true,
        completedAt: new Date(),
      },
    })
  }

  revalidatePath("/")
  return { success: true }
}

// Schema for fetchLLMModels parameters
const fetchLLMModelsParamsSchema = z.object({
  provider: z.enum(["openai"]),
  apiKey: z.string().min(10, "API key is too short").max(500, "API key is too long"),
})

export async function fetchLLMModels(
  provider: "openai",
  apiKey: string
): Promise<{ success: boolean; models?: string[]; error?: string }> {
  // Validate input parameters
  const validated = fetchLLMModelsParamsSchema.safeParse({ provider, apiKey })

  if (!validated.success) {
    const firstError = validated.error.issues?.[0]?.message
    return { success: false, error: firstError || "Invalid parameters" }
  }

  const { provider: validProvider, apiKey: validApiKey } = validated.data

  try {
    if (validProvider === "openai") {
      const { fetchOpenAIModels } = await import("@/lib/connections/openai")
      return await fetchOpenAIModels(validApiKey)
    }

    return { success: false, error: "Invalid provider" }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to fetch models" }
  }
}
