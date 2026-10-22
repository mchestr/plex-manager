"use server"

/**
 * Admin settings for the connected services (Plex, Jellyfin, Tautulli,
 * Overseerr, Sonarr, Radarr, Prometheus).
 *
 * Secrets are never sent to the client, so a blank token or API key means
 * "keep the stored one", but only for the address it was saved with
 * (`resolveSecretForOrigin`, SEC-31). The connection test runs after that rule,
 * so a stored secret never reaches a new address. A refusal carries
 * `fieldErrors` on the secret or URL field, with code copy rather than the
 * tester's message (P10.20). Every save is audited as `CONFIG_CHANGED` with a
 * redacted diff (SEC-55) and expires the cached connection health.
 */

import { revalidatePath, updateTag } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { ok, type ActionErrorCode, type ActionFailure, type ActionResult } from "@/lib/actions/result"
import { testJellyfinConnection } from "@/lib/connections/jellyfin"
import { testOverseerrConnection } from "@/lib/connections/overseerr"
import { getPlexUserInfo, testPlexConnection } from "@/lib/connections/plex"
import { testPrometheusConnection, validatePrometheusQuery } from "@/lib/connections/prometheus"
import { testRadarrConnection } from "@/lib/connections/radarr"
import { testSonarrConnection } from "@/lib/connections/sonarr"
import { testTautulliConnection } from "@/lib/connections/tautulli"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import {
  resolveSecretForOrigin,
  SECRET_REQUIRED_MESSAGE,
  type SecretRequiredCode,
} from "@/lib/security/secret-reuse"
import { jellyfinServerSchema } from "@/lib/validations/jellyfin"
import { overseerrSchema } from "@/lib/validations/overseerr"
import { plexServerSchema } from "@/lib/validations/plex"
import { prometheusSchema } from "@/lib/validations/prometheus"
import { radarrSchema } from "@/lib/validations/radarr"
import { sonarrSchema } from "@/lib/validations/sonarr"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"
import { probeConnection } from "@/lib/settings/probe"
import { connectionTestCopy } from "@/lib/ui/error-copy"
import { tautulliSchema } from "@/lib/validations/tautulli"

type ServerActionCode = ActionErrorCode | SecretRequiredCode
type ServerResult = ActionResult<null, ServerActionCode>

const SECRET_INPUT = z.string().max(500).optional()

type SecretField = "token" | "apiKey"

/**
 * A blank secret that cannot be reused, as an error on the secret field. With
 * nothing stored this is a plain required field (`missing`); otherwise the
 * address changed.
 */
function secretRequired(missing: string | null, field: SecretField): ActionFailure<ServerActionCode> {
  if (missing) return { success: false, code: "VALIDATION", error: missing, fieldErrors: { [field]: [missing] } }
  return { success: false, code: "SECRET_REQUIRED", error: SECRET_REQUIRED_MESSAGE, fieldErrors: { [field]: [SECRET_REQUIRED_MESSAGE] } }
}

/**
 * Runs the connection test with the 5 s cut-off. A failure is
 * `UPSTREAM_UNAVAILABLE` with the code's copy on the URL or secret field,
 * never the tester's message.
 */
async function checkConnection(
  service: string,
  test: () => Promise<{ success: boolean; error?: string }>,
  secretField: SecretField | null
): Promise<ActionFailure<ServerActionCode> | null> {
  const probe = await probeConnection(service, test)
  if (probe.status === "ok") return null
  const copy = connectionTestCopy(probe.code, secretField === "token" ? "Plex token" : "API key")
  const field = copy.field === "secret" && secretField ? secretField : "url"
  return { success: false, code: "UPSTREAM_UNAVAILABLE", error: `${copy.title}. ${copy.fix}`, fieldErrors: { [field]: [copy.fieldError] } }
}

/** After a save: the settings page re-renders and the cached health checks run again. */
function savedSettings() {
  updateTag(CONNECTION_HEALTH_TAG)
  revalidatePath("/admin/settings")
}

/** The fields every saved service row holds besides its secret. */
interface ServiceValues {
  name: string
  url: string
  publicUrl?: string
}

/**
 * The delegate calls that replace a service's active row. Structural, so each
 * service's transaction delegate fits.
 */
interface ActiveRowDelegate<D> {
  updateMany(args: { where: { isActive: true }; data: { isActive: false } }): Promise<unknown>
  findFirst(args: { where: { url: string } }): Promise<{ id: string } | null>
  update(args: { where: { id: string }; data: D }): Promise<unknown>
  create(args: { data: D }): Promise<unknown>
}

/** Deactivates the active row, then updates the row for this URL or creates one. */
async function replaceActiveRow<D extends { url: string; isActive: true }>(delegate: ActiveRowDelegate<NoInfer<D>>, data: D) {
  await delegate.updateMany({ where: { isActive: true }, data: { isActive: false } })
  const existing = await delegate.findFirst({ where: { url: data.url } })
  if (existing) {
    await delegate.update({ where: { id: existing.id }, data })
  } else {
    await delegate.create({ data })
  }
}

function auditServerChange(
  actorId: string,
  section: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  secretField: string
) {
  logAuditEvent(
    AuditEventType.CONFIG_CHANGED,
    actorId,
    configDiff(section, before, after, {
      secretFields: [secretField],
      urlFields: ["url", "publicUrl"],
    })
  )
}

/** A row's audited fields, so the stored and saved states compare like with like. */
function auditedFields(row: { name: string; url: string; publicUrl?: string | null }, secret: string) {
  return { name: row.name, url: row.url, publicUrl: row.publicUrl ?? null, secret }
}

/**
 * Update Plex server configuration (admin only)
 */
export const updatePlexServer = adminAction({
  input: plexServerSchema.extend({ token: SECRET_INPUT }),
  fallbackError: "Failed to update Plex server configuration",
  handler: async (input, { userId }): Promise<ServerResult> => {
    const stored = await prisma.plexServer.findFirst({ where: { isActive: true } })
    const secret = resolveSecretForOrigin({
      submitted: input.token,
      stored: stored && { secret: stored.token, url: stored.url },
      submittedUrl: input.url,
    })
    if (!secret.ok) return secretRequired(stored ? null : "Plex token is required", "token")
    const validated = { ...input, token: secret.secret }

    const refused = await checkConnection("plex", () => testPlexConnection(validated), "token")
    if (refused) return refused

    // The admin's Plex user ID comes from the token
    const userInfoResult = await getPlexUserInfo(validated.token)
    if (!userInfoResult.success || !userInfoResult.data) {
      const copy = connectionTestCopy("UNAUTHORIZED", "Plex token")
      return { success: false, code: "UPSTREAM_UNAVAILABLE", error: `${copy.title}. ${copy.fix}`, fieldErrors: { token: [copy.fieldError] } }
    }
    const adminPlexUserId = userInfoResult.data.id

    await prisma.$transaction((tx) =>
      replaceActiveRow(tx.plexServer, {
        name: validated.name,
        url: validated.url,
        token: validated.token,
        publicUrl: validated.publicUrl,
        adminPlexUserId,
        isActive: true,
      })
    )

    auditServerChange(
      userId,
      "plex",
      stored && auditedFields(stored, stored.token),
      auditedFields(validated, validated.token),
      "secret"
    )
    savedSettings()
    return ok(null)
  },
})

/** The five services that store a URL, an optional public URL and an API key. */
type ApiKeyService = "jellyfin" | "tautulli" | "overseerr" | "sonarr" | "radarr"

interface ApiKeyServiceDefinition {
  findActive: () => Promise<{ name: string; url: string; publicUrl: string | null; apiKey: string } | null>
  test: (config: ServiceValues & { apiKey: string }) => Promise<{ success: boolean; error?: string }>
  delegate: (tx: PrismaTransactionClient) => ActiveRowDelegate<ServiceValues & { apiKey: string; isActive: true }>
}

const API_KEY_SERVICES: Record<ApiKeyService, ApiKeyServiceDefinition> = {
  jellyfin: {
    findActive: () => prisma.jellyfinServer.findFirst({ where: { isActive: true } }),
    test: testJellyfinConnection,
    delegate: (tx) => tx.jellyfinServer,
  },
  tautulli: {
    findActive: () => prisma.tautulli.findFirst({ where: { isActive: true } }),
    test: testTautulliConnection,
    delegate: (tx) => tx.tautulli,
  },
  overseerr: {
    findActive: () => prisma.overseerr.findFirst({ where: { isActive: true } }),
    test: testOverseerrConnection,
    delegate: (tx) => tx.overseerr,
  },
  sonarr: {
    findActive: () => prisma.sonarr.findFirst({ where: { isActive: true } }),
    test: testSonarrConnection,
    delegate: (tx) => tx.sonarr,
  },
  radarr: {
    findActive: () => prisma.radarr.findFirst({ where: { isActive: true } }),
    test: testRadarrConnection,
    delegate: (tx) => tx.radarr,
  },
}

/** The input every API-key service form sends: its schema, with the key optional. */
const apiKeyInput = (schema: typeof tautulliSchema) => schema.extend({ apiKey: SECRET_INPUT })
type ApiKeyInput = z.output<ReturnType<typeof apiKeyInput>>

/**
 * Saves one API-key service: resolve the key for the submitted origin, test
 * the connection, replace the active row, audit the change.
 */
async function saveApiKeyService(service: ApiKeyService, input: ApiKeyInput, actorId: string): Promise<ServerResult> {
  const definition = API_KEY_SERVICES[service]
  const stored = await definition.findActive()
  const secret = resolveSecretForOrigin({
    submitted: input.apiKey,
    stored: stored && { secret: stored.apiKey, url: stored.url },
    submittedUrl: input.url,
  })
  if (!secret.ok) return secretRequired(stored ? null : "API key is required", "apiKey")
  const validated = { ...input, apiKey: secret.secret }

  const refused = await checkConnection(service, () => definition.test(validated), "apiKey")
  if (refused) return refused

  await prisma.$transaction((tx) =>
    replaceActiveRow(definition.delegate(tx), {
      name: validated.name,
      url: validated.url,
      apiKey: validated.apiKey,
      publicUrl: validated.publicUrl,
      isActive: true,
    })
  )

  auditServerChange(
    actorId,
    service,
    stored && auditedFields(stored, stored.apiKey),
    auditedFields(validated, validated.apiKey),
    "secret"
  )
  savedSettings()
  return ok(null)
}

/** Update Jellyfin server configuration (admin only) */
export const updateJellyfinServer = adminAction({
  input: apiKeyInput(jellyfinServerSchema),
  fallbackError: "Failed to update Jellyfin server configuration",
  handler: (input, { userId }) => saveApiKeyService("jellyfin", input, userId),
})

/** Update Tautulli configuration (admin only) */
export const updateTautulli = adminAction({
  input: apiKeyInput(tautulliSchema),
  fallbackError: "Failed to update Tautulli configuration",
  handler: (input, { userId }) => saveApiKeyService("tautulli", input, userId),
})

/** Update Overseerr configuration (admin only) */
export const updateOverseerr = adminAction({
  input: apiKeyInput(overseerrSchema),
  fallbackError: "Failed to update Overseerr configuration",
  handler: (input, { userId }) => saveApiKeyService("overseerr", input, userId),
})

/** Update Sonarr configuration (admin only) */
export const updateSonarr = adminAction({
  input: apiKeyInput(sonarrSchema),
  fallbackError: "Failed to update Sonarr configuration",
  handler: (input, { userId }) => saveApiKeyService("sonarr", input, userId),
})

/** Update Radarr configuration (admin only) */
export const updateRadarr = adminAction({
  input: apiKeyInput(radarrSchema),
  fallbackError: "Failed to update Radarr configuration",
  handler: (input, { userId }) => saveApiKeyService("radarr", input, userId),
})

/**
 * Update Prometheus configuration (admin only)
 */
export const updatePrometheus = adminAction({
  input: prometheusSchema,
  fallbackError: "Failed to update Prometheus configuration",
  handler: async (validated, { userId }): Promise<ServerResult> => {
    const refused = await checkConnection("prometheus", () => testPrometheusConnection(validated), null)
    if (refused) return refused

    const queryTest = await validatePrometheusQuery(validated)
    if (!queryTest.success) {
      return { success: false, code: "VALIDATION", error: queryTest.error || "Invalid PromQL query" }
    }

    const stored = await prisma.prometheus.findFirst({ where: { isActive: true } })
    await prisma.$transaction((tx) =>
      replaceActiveRow(tx.prometheus, {
        name: validated.name,
        url: validated.url,
        query: validated.query,
        isActive: true,
      })
    )

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff(
        "prometheus",
        stored && { name: stored.name, url: stored.url, query: stored.query },
        { name: validated.name, url: validated.url, query: validated.query },
        { urlFields: ["url"] }
      )
    )
    savedSettings()
    revalidatePath("/") // The home page shows the status
    return ok(null)
  },
})

/**
 * Allow Jellyfin sign-in, or turn it off (admin only)
 * When off, the Jellyfin provider refuses every sign-in and the home page
 * shows no Jellyfin login option
 */
export const toggleJellyfinLogin = adminAction({
  input: z.boolean({ message: "Invalid input: enabled must be a boolean" }),
  fallbackError: "Failed to toggle Jellyfin login setting",
  handler: async (enabled, { userId }) => {
    const stored = await prisma.jellyfinServer.findFirst({
      where: { isActive: true },
      select: { enabledForLogin: true },
    })
    await prisma.jellyfinServer.updateMany({
      where: { isActive: true },
      data: { enabledForLogin: enabled },
    })

    logAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      userId,
      configDiff("jellyfin.login", stored, { enabledForLogin: enabled })
    )
    revalidatePath("/admin/settings")
    revalidatePath("/")
    return ok(null)
  },
})
