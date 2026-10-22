"use server"

/**
 * The first-run setup wizard's saves. Anyone may call them until setup
 * completes (P11.32 adds a claim); after that only an admin may. Each save
 * tests the connection first, writes the row and the wizard's step in one
 * transaction, and is audited as `CONFIG_CHANGED` with the actor `setup`
 * during the first run.
 */

import { revalidatePath } from "next/cache"
import type { Session } from "next-auth"
import { z } from "zod"

import { publicAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionErrorCode, type ActionFailure, type ActionResult } from "@/lib/actions/result"
import { testLLMProviderConnection } from "@/lib/connections/llm-provider"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { getPlexServerIdentity, getPlexUserInfo, testPlexConnection } from "@/lib/connections/plex"
import { testPrometheusConnection } from "@/lib/connections/prometheus"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { resolveSecretForOrigin, SECRET_REQUIRED_MESSAGE, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import { getSetupStatus } from "@/lib/setup/status"
import { discordIntegrationSchema } from "@/lib/validations/discord"
import { setupLLMProviderSchema } from "@/lib/validations/llm-provider"
import { overseerrSchema } from "@/lib/validations/overseerr"
import { plexServerSchema } from "@/lib/validations/plex"
import { prometheusSchema } from "@/lib/validations/prometheus"
import { radarrSchema } from "@/lib/validations/radarr"
import type { ServiceParsed } from "@/lib/validations/shared-schemas"
import { sonarrSchema } from "@/lib/validations/sonarr"
import { tautulliSchema } from "@/lib/validations/tautulli"

type SetupCode = ActionErrorCode | SecretRequiredCode

/** The client a `prisma.$transaction` callback receives (the extended client's, not `Prisma.TransactionClient`). */
type Tx = Parameters<Extract<Parameters<typeof prisma.$transaction>[0], (...args: never[]) => unknown>>[0]

/**
 * The actor for the audit trail: `setup` before setup completes, then the
 * admin's id. A non-admin after completion is refused.
 */
async function setupActor(session: Session | null): Promise<{ ok: true; actor: string } | { ok: false; result: ActionFailure }> {
  if (!(await getSetupStatus()).isComplete) return { ok: true, actor: "setup" }
  if (!session?.user?.id) return { ok: false, result: fail("UNAUTHENTICATED", "Please sign in to continue.") }
  if (!session.user.isAdmin) return { ok: false, result: fail("FORBIDDEN", "Admins only.") }
  return { ok: true, actor: session.user.id }
}

/** A setup save: the actor check, then `handler`. Errors map to `fallbackError`, never their text. */
function setupAction<S extends z.ZodType, T>(
  input: S,
  fallbackError: string,
  handler: (data: z.output<S>, actor: string) => Promise<ActionResult<T, SetupCode>>
) {
  return publicAction({
    input,
    fallbackError,
    handler: async (data, { session }): Promise<ActionResult<T, SetupCode>> => {
      const actor = await setupActor(session)
      if (!actor.ok) return actor.result
      return handler(data as z.output<S>, actor.actor)
    },
  })
}

/** Fails with the first issue and the field errors, as the action helper would. */
function invalid(error: z.ZodError): ActionFailure {
  const { fieldErrors } = z.flattenError(error)
  return fail("VALIDATION", error.issues[0]?.message ?? "Invalid input", {
    fieldErrors: fieldErrors as Record<string, string[]>,
  })
}

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
): { ok: true; secret: string | undefined } | { ok: false; result: ActionFailure<SecretRequiredCode> } {
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

/** Moves the wizard to `step`, creating its row on the first save. */
async function advanceSetup(tx: Tx, step: number) {
  const setup = await tx.setup.findFirst({ orderBy: { createdAt: "desc" } })
  if (setup) {
    await tx.setup.update({ where: { id: setup.id }, data: { currentStep: step } })
  } else {
    await tx.setup.create({ data: { currentStep: step } })
  }
}

/** A service form as sent: its secret may be blank to keep the stored one. Every other field is checked after. */
const withOptionalSecret = <K extends string>(key: K) =>
  z.looseObject({ url: z.string().max(2048), ...({ [key]: z.string().max(500).optional() } as Record<K, z.ZodOptional<z.ZodString>>) })

/** What differs between the four API-key services' saves. */
interface ServiceSave {
  section: string
  label: string
  step: number
  schema: z.ZodType<ServiceParsed>
  test: (config: ServiceParsed) => Promise<{ success: boolean; error?: string }>
  stored: () => Promise<{ name: string; url: string; publicUrl: string | null; apiKey: string } | null>
  create: (tx: Tx, data: ServiceParsed & { isActive: true }) => Promise<unknown>
}

/** A save for an API-key service (Tautulli, Overseerr, Sonarr, Radarr; DUP-11). */
function serviceSave(service: ServiceSave) {
  return setupAction(withOptionalSecret("apiKey"), `Failed to save ${service.label} configuration`, async (data, actor) => {
    const stored = await service.stored()
    const secret = setupSecret(data.apiKey, data.url, stored && { secret: stored.apiKey, url: stored.url })
    if (!secret.ok) return secret.result
    const parsed = service.schema.safeParse({ ...data, apiKey: secret.secret })
    if (!parsed.success) return invalid(parsed.error)
    const validated = parsed.data

    const connectionTest = await service.test(validated)
    if (!connectionTest.success) {
      return fail("UPSTREAM_UNAVAILABLE", connectionTest.error || `Failed to connect to ${service.label} server`)
    }

    await prisma.$transaction(async (tx) => {
      await advanceSetup(tx, service.step)
      await service.create(tx, {
        name: validated.name,
        url: validated.url,
        apiKey: validated.apiKey,
        publicUrl: validated.publicUrl,
        isActive: true,
      })
    })

    auditSetupSave(
      actor,
      service.section,
      stored && { name: stored.name, url: stored.url, publicUrl: stored.publicUrl, apiKey: stored.apiKey },
      { name: validated.name, url: validated.url, publicUrl: validated.publicUrl ?? null, apiKey: validated.apiKey },
      ["apiKey"]
    )
    revalidatePath("/setup")
    return ok(null)
  })
}

const activeOnly = { where: { isActive: true } } as const

/** Saves the Plex server and records its owner as the admin (step 2). */
export const savePlexServer = setupAction(
  withOptionalSecret("token"),
  "Failed to save Plex server configuration",
  async (data, actor) => {
    const stored = await prisma.plexServer.findFirst(activeOnly)
    const secret = setupSecret(data.token, data.url, stored && { secret: stored.token, url: stored.url })
    if (!secret.ok) return secret.result
    const parsed = plexServerSchema.safeParse({ ...data, token: secret.secret })
    if (!parsed.success) return invalid(parsed.error)
    const validated = parsed.data

    const connectionTest = await testPlexConnection(validated)
    if (!connectionTest.success) {
      return fail("UPSTREAM_UNAVAILABLE", connectionTest.error || "Failed to connect to Plex server")
    }

    // The token's own account is the server owner, whom every login promotes
    const userInfoResult = await getPlexUserInfo(validated.token)
    if (!userInfoResult.success || !userInfoResult.data) {
      return fail("UPSTREAM_UNAVAILABLE", "Failed to fetch user info from Plex token")
    }
    const adminPlexUserId = userInfoResult.data.id
    // Stored so sign-in and invites need no /identity call; filled later if the PMS does not say now
    const identity = await getPlexServerIdentity(validated)

    await prisma.$transaction(async (tx) => {
      await advanceSetup(tx, 2)
      await tx.plexServer.create({
        data: {
          name: validated.name,
          url: validated.url,
          token: validated.token,
          publicUrl: validated.publicUrl,
          adminPlexUserId,
          machineIdentifier: identity.machineIdentifier ?? null,
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
    return ok(null)
  }
)

/** Saves Tautulli (step 3). */
export const saveTautulli = serviceSave({
  section: "tautulli",
  label: "Tautulli",
  step: 3,
  schema: tautulliSchema,
  test: testTautulliConnection,
  stored: () => prisma.tautulli.findFirst(activeOnly),
  create: (tx, data) => tx.tautulli.create({ data }),
})

/** Saves Overseerr (step 4). */
export const saveOverseerr = serviceSave({
  section: "overseerr",
  label: "Overseerr",
  step: 4,
  schema: overseerrSchema,
  test: testOverseerrConnection,
  stored: () => prisma.overseerr.findFirst(activeOnly),
  create: (tx, data) => tx.overseerr.create({ data }),
})

/** Saves Sonarr (step 5). */
export const saveSonarr = serviceSave({
  section: "sonarr",
  label: "Sonarr",
  step: 5,
  schema: sonarrSchema,
  test: testSonarrConnection,
  stored: () => prisma.sonarr.findFirst(activeOnly),
  create: (tx, data) => tx.sonarr.create({ data }),
})

/** Saves Radarr (step 6). */
export const saveRadarr = serviceSave({
  section: "radarr",
  label: "Radarr",
  step: 6,
  schema: radarrSchema,
  test: testRadarrConnection,
  stored: () => prisma.radarr.findFirst(activeOnly),
  create: (tx, data) => tx.radarr.create({ data }),
})

/** Saves the Discord integration (step 7). The client secret goes only to Discord, so it keeps "blank means keep". */
export const saveDiscordIntegration = setupAction(
  discordIntegrationSchema,
  "Failed to save Discord integration",
  async (validated, actor) => {
    const isEnabled = validated.isEnabled ?? false
    const botEnabled = validated.botEnabled ?? false

    if (isEnabled && (!validated.clientId || !validated.clientSecret)) {
      return fail("VALIDATION", "Client ID and Client Secret are required when enabling Discord integration")
    }

    const row = {
      isEnabled,
      botEnabled,
      clientId: validated.clientId,
      clientSecret: validated.clientSecret,
      guildId: validated.guildId,
      serverInviteCode: validated.serverInviteCode,
      platformName: validated.platformName,
      instructions: validated.instructions,
    }

    await prisma.$transaction(async (tx) => {
      await advanceSetup(tx, 7)
      await tx.discordIntegration.upsert({
        where: { id: "discord" },
        update: row,
        create: { id: "discord", ...row },
      })
    })

    auditSetupSave(actor, "discord", null, row, ["clientSecret"])
    revalidatePath("/setup")
    revalidatePath("/discord/link")
    revalidatePath("/admin/settings")
    return ok(null)
  }
)

/** Saves an OpenAI provider for `purpose` and moves the wizard to `nextStep`. Setup checks the key only. */
function llmProviderSave(purpose: "chat" | "wrapped", nextStep: number) {
  return setupAction(setupLLMProviderSchema, "Failed to save LLM provider configuration", async (validated, actor) => {
    // The model field is free text, as before P2.12
    const connectionTest = await testLLMProviderConnection(validated, { customModel: true })
    if (!connectionTest.success) {
      return fail("UPSTREAM_UNAVAILABLE", connectionTest.error || "Failed to connect to LLM provider")
    }

    const model = validated.model || DEFAULT_OPENAI_MODEL
    await prisma.$transaction(async (tx) => {
      await advanceSetup(tx, nextStep)
      await tx.lLMProvider.updateMany({ where: { isActive: true, purpose }, data: { isActive: false } })
      await tx.lLMProvider.create({
        data: {
          provider: validated.provider,
          purpose,
          apiKey: validated.apiKey,
          model,
          temperature: validated.temperature ?? null,
          maxTokens: validated.maxTokens ?? null,
          isActive: true,
        },
      })
    })

    // Setup is OpenAI only, so the key always goes to api.openai.com
    auditSetupSave(actor, `llm.${purpose}`, null, { provider: validated.provider, model, apiKey: validated.apiKey }, ["apiKey"])
    revalidatePath("/setup")
    return ok(null)
  })
}

/** Saves the chat assistant's provider (step 8). */
export const saveChatLLMProvider = llmProviderSave("chat", 8)

/** Saves the Rewind provider (step 10). */
export const saveLLMProvider = llmProviderSave("wrapped", 10)

/** Saves Prometheus (step 10). */
export const savePrometheus = setupAction(prometheusSchema, "Failed to save Prometheus configuration", async (validated, actor) => {
  const connectionTest = await testPrometheusConnection(validated)
  if (!connectionTest.success) {
    return fail("UPSTREAM_UNAVAILABLE", connectionTest.error || "Failed to connect to Prometheus server")
  }

  await prisma.$transaction(async (tx) => {
    await advanceSetup(tx, 10)
    await tx.prometheus.create({
      data: { name: validated.name, url: validated.url, query: validated.query, isActive: true },
    })
  })

  auditSetupSave(actor, "prometheus", null, { name: validated.name, url: validated.url, query: validated.query })
  revalidatePath("/setup")
  return ok(null)
})

/** Marks setup complete; from then on these saves are admin only. */
export const completeSetup = setupAction(z.undefined(), "Failed to finish setup", async (_input, actor) => {
  const setup = await prisma.setup.findFirst({ orderBy: { createdAt: "desc" } })
  if (setup) {
    await prisma.setup.update({
      where: { id: setup.id },
      data: { isComplete: true, completedAt: new Date() },
    })
  }

  auditSetupSave(actor, "complete", null, { isComplete: true })
  revalidatePath("/")
  return ok(null)
})
