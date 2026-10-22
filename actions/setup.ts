"use server"

import { requireAdmin } from "@/lib/admin"
import { testLLMProviderConnection } from "@/lib/connections/llm-provider"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { testPlexConnection } from "@/lib/connections/plex"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { resolveSecretForOrigin, SECRET_REQUIRED_MESSAGE, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import { discordIntegrationSchema, type DiscordIntegrationInputData } from "@/lib/validations/discord"
import { setupLLMProviderSchema, type SetupLLMProviderInput } from "@/lib/validations/llm-provider"
import { overseerrSchema, type OverseerrInput, type OverseerrParsed } from "@/lib/validations/overseerr"
import { plexServerSchema, type PlexServerInput, type PlexServerParsed } from "@/lib/validations/plex"
import { radarrSchema, type RadarrInput, type RadarrParsed } from "@/lib/validations/radarr"
import { sonarrSchema, type SonarrInput, type SonarrParsed } from "@/lib/validations/sonarr"
import { tautulliSchema, type TautulliInput, type TautulliParsed } from "@/lib/validations/tautulli"
import { prometheusSchema, type PrometheusInput, type PrometheusParsed } from "@/lib/validations/prometheus"
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

/**
 * Requires admin authentication if setup is already complete, and returns the
 * actor for the audit trail: the admin's id, or `setup` during the first run
 * (before completion anyone can reach these actions; P11.32 adds a claim).
 */
async function setupActor(): Promise<string> {
  const setupStatus = await getSetupStatus()
  if (!setupStatus.isComplete) return "setup"
  return (await requireAdmin()).user.id
}

/** A setup input whose secret may be left blank to keep the stored one. */
type WithOptionalSecret<T, K extends keyof T> = Omit<T, K> & { [P in K]?: string }

/**
 * The secret for a setup save: the submitted one, or the stored one for the
 * same origin (`resolveSecretForOrigin`), so Back-and-edit never sends a stored
 * secret to a new address. With nothing stored, a blank secret is passed on for
 * the schema to reject.
 */
function setupSecret(
  submitted: string | undefined,
  url: string,
  stored: { secret: string; url: string } | null
): { ok: true; secret: string | undefined } | { ok: false; result: { success: false; code: SecretRequiredCode; error: string } } {
  if (!stored) return { ok: true, secret: submitted }
  const resolution = resolveSecretForOrigin({ submitted, stored, submittedUrl: url })
  if (!resolution.ok) {
    return { ok: false, result: { success: false, code: resolution.code, error: SECRET_REQUIRED_MESSAGE } }
  }
  return { ok: true, secret: resolution.secret }
}

function auditSetupSave(
  actor: string,
  section: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  secretFields: string[] = []
) {
  logAuditEvent(
    AuditEventType.CONFIG_CHANGED,
    actor,
    configDiff(`setup.${section}`, before, after, { secretFields, urlFields: ["url", "publicUrl", "baseUrl"] })
  )
}

export async function savePlexServer(data: WithOptionalSecret<PlexServerInput, "token">) {
  try {
    const actor = await setupActor()

    const stored = await prisma.plexServer.findFirst({ where: { isActive: true } })
    const secret = setupSecret(data.token, data.url, stored && { secret: stored.token, url: stored.url })
    if (!secret.ok) return secret.result
    const validated: PlexServerParsed = plexServerSchema.parse({ ...data, token: secret.secret })

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

      // Create Plex server configuration
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
    })

    auditSetupSave(
      actor,
      "plex",
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, token: stored.token },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, token: validated.token },
      ["token"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Plex server configuration" }
  }
}

export async function saveTautulli(data: WithOptionalSecret<TautulliInput, "apiKey">) {
  try {
    const actor = await setupActor()

    const stored = await prisma.tautulli.findFirst({ where: { isActive: true } })
    const secret = setupSecret(data.apiKey, data.url, stored && { secret: stored.apiKey, url: stored.url })
    if (!secret.ok) return secret.result
    const validated: TautulliParsed = tautulliSchema.parse({ ...data, apiKey: secret.secret })

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

      // Create Tautulli configuration
      await tx.tautulli.create({
        data: {
          name: validated.name,
          url: validated.url,
          apiKey: validated.apiKey,
          publicUrl: validated.publicUrl,
          isActive: true,
        },
      })
    })

    auditSetupSave(
      actor,
      "tautulli",
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, apiKey: stored.apiKey },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Tautulli configuration" }
  }
}

export async function saveOverseerr(data: WithOptionalSecret<OverseerrInput, "apiKey">) {
  try {
    const actor = await setupActor()

    const stored = await prisma.overseerr.findFirst({ where: { isActive: true } })
    const secret = setupSecret(data.apiKey, data.url, stored && { secret: stored.apiKey, url: stored.url })
    if (!secret.ok) return secret.result
    const validated: OverseerrParsed = overseerrSchema.parse({ ...data, apiKey: secret.secret })

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

      // Create Overseerr configuration
      await tx.overseerr.create({
        data: {
          name: validated.name,
          url: validated.url,
          apiKey: validated.apiKey,
          publicUrl: validated.publicUrl,
          isActive: true,
        },
      })
    })

    auditSetupSave(
      actor,
      "overseerr",
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, apiKey: stored.apiKey },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Overseerr configuration" }
  }
}

export async function saveSonarr(data: WithOptionalSecret<SonarrInput, "apiKey">) {
  try {
    const actor = await setupActor()

    const stored = await prisma.sonarr.findFirst({ where: { isActive: true } })
    const secret = setupSecret(data.apiKey, data.url, stored && { secret: stored.apiKey, url: stored.url })
    if (!secret.ok) return secret.result
    const validated: SonarrParsed = sonarrSchema.parse({ ...data, apiKey: secret.secret })

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

      // Create Sonarr configuration
      await tx.sonarr.create({
        data: {
          name: validated.name,
          url: validated.url,
          apiKey: validated.apiKey,
          publicUrl: validated.publicUrl,
          isActive: true,
        },
      })
    })

    auditSetupSave(
      actor,
      "sonarr",
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, apiKey: stored.apiKey },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Sonarr configuration" }
  }
}

export async function saveRadarr(data: WithOptionalSecret<RadarrInput, "apiKey">) {
  try {
    const actor = await setupActor()

    const stored = await prisma.radarr.findFirst({ where: { isActive: true } })
    const secret = setupSecret(data.apiKey, data.url, stored && { secret: stored.apiKey, url: stored.url })
    if (!secret.ok) return secret.result
    const validated: RadarrParsed = radarrSchema.parse({ ...data, apiKey: secret.secret })

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

      // Create Radarr configuration
      await tx.radarr.create({
        data: {
          name: validated.name,
          url: validated.url,
          apiKey: validated.apiKey,
          publicUrl: validated.publicUrl,
          isActive: true,
        },
      })
    })

    auditSetupSave(
      actor,
      "radarr",
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, apiKey: stored.apiKey },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Radarr configuration" }
  }
}

export async function saveDiscordIntegration(data: DiscordIntegrationInputData) {
  try {
    const actor = await setupActor()

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

      await tx.discordIntegration.upsert({
        where: { id: "discord" },
        update: {
          isEnabled,
          botEnabled,
          clientId: validated.clientId,
          clientSecret: validated.clientSecret,
          guildId: validated.guildId,
          serverInviteCode: validated.serverInviteCode,
          platformName: validated.platformName,
          instructions: validated.instructions,
        },
        create: {
          id: "discord",
          isEnabled,
          botEnabled,
          clientId: validated.clientId,
          clientSecret: validated.clientSecret,
          guildId: validated.guildId,
          serverInviteCode: validated.serverInviteCode,
          platformName: validated.platformName,
          instructions: validated.instructions,
        },
      })
    })

    // The client secret goes only to Discord, so it keeps "blank means keep"
    auditSetupSave(
      actor,
      "discord",
      null,
      {
        isEnabled,
        botEnabled,
        clientId: validated.clientId,
        clientSecret: validated.clientSecret,
        guildId: validated.guildId,
        serverInviteCode: validated.serverInviteCode,
        platformName: validated.platformName,
        instructions: validated.instructions,
      },
      ["clientSecret"]
    )
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
  data: SetupLLMProviderInput,
  purpose: "chat" | "wrapped",
  nextStep: number
) {
  try {
    const actor = await setupActor()

    const validated = setupLLMProviderSchema.parse(data)

    // Setup checks the key only; its model field is free text, as before P2.12
    const connectionTest = await testLLMProviderConnection(validated, { customModel: true })
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

      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose },
        data: { isActive: false },
      })

      await tx.lLMProvider.create({
        data: {
          provider: validated.provider,
          purpose,
          apiKey: validated.apiKey,
          model: validated.model || DEFAULT_OPENAI_MODEL,
          temperature: validated.temperature ?? null,
          maxTokens: validated.maxTokens ?? null,
          isActive: true,
        },
      })
    })

    // Setup is OpenAI only, so the key always goes to api.openai.com
    auditSetupSave(
      actor,
      `llm.${purpose}`,
      null,
      { provider: validated.provider, model: validated.model || DEFAULT_OPENAI_MODEL, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save LLM provider configuration" }
  }
}

export async function saveChatLLMProvider(data: SetupLLMProviderInput) {
  return saveLLMProviderForPurpose(data, "chat", 8)
}

export async function saveLLMProvider(data: SetupLLMProviderInput) {
  return saveLLMProviderForPurpose(data, "wrapped", 10)
}

export async function savePrometheus(data: PrometheusInput) {
  try {
    const actor = await setupActor()

    const validated: PrometheusParsed = prometheusSchema.parse(data)

    // Test connection before saving
    const { testPrometheusConnection } = await import("@/lib/connections/prometheus")
    const connectionTest = await testPrometheusConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to Prometheus server" }
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
            currentStep: 10,
          },
        })
      } else {
        await tx.setup.create({
          data: {
            currentStep: 10,
          },
        })
      }

      // Create Prometheus configuration
      await tx.prometheus.create({
        data: {
          name: validated.name,
          url: validated.url,
          query: validated.query,
          isActive: true,
        },
      })
    })

    auditSetupSave(actor, "prometheus", null, { name: validated.name, url: validated.url, query: validated.query })
    revalidatePath("/setup")
    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message }
    }
    return { success: false, error: "Failed to save Prometheus configuration" }
  }
}

export async function completeSetup() {
  const actor = await setupActor()

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

  auditSetupSave(actor, "complete", null, { isComplete: true })
  revalidatePath("/")
  return { success: true }
}

