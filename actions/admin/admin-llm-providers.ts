"use server"

/**
 * LLM provider settings for the two purposes (chat assistant and Rewind).
 *
 * The base URL of an OpenAI-compatible server is an admin-only SSRF surface
 * (SEC-44), so only these admin actions accept one. A blank API key keeps the
 * stored key only while the provider and the key's destination origin are
 * unchanged (`resolveSecretForOrigin`, P4.6); otherwise the key must be entered
 * again, so a stored key is never sent to a new address. Saves are audited as
 * `CONFIG_CHANGED` with a redacted diff.
 *
 * Rewind's model is frozen while the season is open (P8.1): from
 * `rewindSeasonOpens` to the end of `rewindSeasonCloses`, a `wrapped` save
 * that changes the provider, the model or an OpenAI-compatible base URL is
 * refused, because member and hide regenerations still run after the final
 * cut. Rotating the key stays open, and so does the assistant's provider;
 * `rewindLlmMode` remains the emergency switch.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { ok, type ActionErrorCode, type ActionResult } from "@/lib/actions/result"
import { loadProviderModels, testLLMProviderConnection } from "@/lib/connections/llm-provider"
import type { LLMProvider } from "@/lib/generated/prisma/client"
import { requireAdmin } from "@/lib/admin"
import { lookupModel, normalizeModelId } from "@/lib/llm/models"
import { LLM_PROVIDER_IDS } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import { consume } from "@/lib/security/rate-limit"
import { resolveSecretForOrigin, type SecretRequiredCode } from "@/lib/security/secret-reuse"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { EFFORT_LEVELS, llmProviderSchema } from "@/lib/validations/llm-provider"
import { normalizeBaseUrl } from "@/lib/validations/shared-schemas"
import { getSeasonState } from "@/lib/wrapped/season"

const logger = createLogger("ADMIN_LLM_PROVIDERS")

type LLMProviderPurpose = "chat" | "wrapped"

const RATE_LIMITED = "Too many model requests. Wait a few minutes and try again."

const saveInputSchema = z.object({
  provider: z.enum(LLM_PROVIDER_IDS, { message: "Please select a provider" }),
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().max(2048).optional(),
  model: z.string().max(200),
  effort: z.enum(EFFORT_LEVELS).optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  /** The model was typed in rather than picked from the provider's list. */
  customModel: z.boolean().optional(),
})

const listInputSchema = z.object({
  purpose: z.enum(["chat", "wrapped"]),
  /** Omitted: list the purpose's active provider with its stored settings. */
  provider: z.enum(LLM_PROVIDER_IDS).optional(),
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().max(2048).optional(),
})

type ListResult =
  | { success: true; models: string[]; configuredProvider: string | null; configuredModel: string | null }
  | { success: false; error: string }

type SaveResult = ActionResult<null, ActionErrorCode | SecretRequiredCode>

/** Where each hosted provider's key is sent. An OpenAI-compatible key goes to its base URL. */
const HOSTED_API_ORIGINS: Record<string, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
}

function keyDestination(provider: string, baseUrl: string | null | undefined): string {
  return (provider === "openai-compatible" ? baseUrl : HOSTED_API_ORIGINS[provider]) ?? ""
}

/**
 * The stored key, when it may be reused: same provider, and the same
 * destination origin.
 *
 * @internal
 */
function reusableKey(stored: LLMProvider | null, provider: string, baseUrl: string | undefined): string | undefined {
  if (!stored || stored.provider !== provider) return undefined
  const resolution = resolveSecretForOrigin({
    submitted: undefined,
    stored: { secret: stored.apiKey, url: keyDestination(stored.provider, stored.baseUrl) },
    submittedUrl: keyDestination(provider, baseUrl),
  })
  return resolution.ok ? resolution.secret : undefined
}

/** The submitted base URL, normalised, for an OpenAI-compatible provider only. */
function baseUrlFor(provider: string, baseUrl: string | undefined): string | undefined {
  if (provider !== "openai-compatible" || !baseUrl?.trim()) return undefined
  return normalizeBaseUrl(baseUrl) ?? baseUrl
}

async function adminUserId(): Promise<string | null> {
  try {
    return (await requireAdmin()).user.id
  } catch {
    return null
  }
}

function activeProvider(purpose: LLMProviderPurpose) {
  return prisma.lLMProvider.findFirst({ where: { isActive: true, purpose } })
}

/** The audited fields of a provider row, the key included only for the diff's boolean. */
function auditedFields(row: Pick<LLMProvider, "provider" | "model" | "baseUrl" | "effort" | "temperature" | "maxTokens" | "apiKey">) {
  const { provider, model, baseUrl, effort, temperature, maxTokens, apiKey } = row
  return { provider, model, baseUrl, effort, temperature, maxTokens, apiKey }
}

/**
 * The stored base URL as a save sees it: normalised, and only for an
 * OpenAI-compatible row, so an older row's trailing slash or a hosted row's
 * leftover URL never reads as a change.
 */
function storedBaseUrl(stored: LLMProvider): string | null {
  if (stored.provider !== "openai-compatible" || !stored.baseUrl) return null
  return normalizeBaseUrl(stored.baseUrl) ?? stored.baseUrl
}

/**
 * The refusal of a Rewind model change while the season is open, or null.
 * A first provider, a key rotation and setting changes pass.
 */
async function frozenModelRefusal(stored: LLMProvider | null, next: { provider: string; model: string; baseUrl: string | null }): Promise<string | null> {
  if (!stored) return null
  const changed =
    stored.provider !== next.provider || normalizeModelId(stored.model) !== normalizeModelId(next.model) || storedBaseUrl(stored) !== next.baseUrl
  if (!changed) return null
  const season = await getSeasonState()
  if (!season.isOpen) return null
  const closes = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: await serverZone() }).format(season.closesAt.getTime() - 1)
  return `Rewind's model is frozen until the season closes on ${closes}`
}

async function updateLLMProviderForPurpose(
  purpose: LLMProviderPurpose,
  input: z.output<typeof saveInputSchema>,
  userId: string
): Promise<SaveResult> {
  const { provider, customModel } = input
  const baseUrl = baseUrlFor(provider, input.baseUrl)
  const stored = await activeProvider(purpose)
  const submittedKey = input.apiKey?.trim()
  const apiKey = submittedKey || reusableKey(stored, provider, baseUrl) || (provider === "openai-compatible" ? undefined : "")

  const parsed = llmProviderSchema.safeParse({ ...input, apiKey, baseUrl })
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid provider settings"
    // A blank key that cannot be reused reads as "API key is required"; say why
    const keyIssue = parsed.error.issues.some((issue) => issue.path[0] === "apiKey")
    if (keyIssue && !submittedKey && stored?.apiKey) {
      return { success: false, code: "SECRET_REQUIRED", error: "Enter the API key again: the provider or its address changed." }
    }
    return { success: false, code: "VALIDATION", error: message }
  }
  const validated = parsed.data
  const validatedBaseUrl = validated.provider === "openai-compatible" ? validated.baseUrl : null

  if (purpose === "wrapped") {
    const refusal = await frozenModelRefusal(stored, { provider: validated.provider, model: validated.model, baseUrl: validatedBaseUrl ?? null })
    if (refusal) return { success: false, code: "CONFLICT", error: refusal }
  }

  const connection = await testLLMProviderConnection(
    { provider: validated.provider, apiKey: validated.apiKey, baseUrl: validatedBaseUrl ?? undefined, model: validated.model },
    { customModel }
  )
  if (!connection.success) {
    return { success: false, code: "UPSTREAM_UNAVAILABLE", error: connection.error ?? "Failed to connect to the LLM provider" }
  }

  // Settings the model does not take are not stored, so they cannot be sent later
  const { capabilities } = lookupModel(validated.provider, validated.model)
  const settings = {
    effort: capabilities.effortLevels && validated.effort ? validated.effort : null,
    temperature: capabilities.samplingParams ? (validated.temperature ?? null) : null,
    maxTokens: validated.maxTokens ?? null,
  }
  const storedKey = validated.apiKey ?? ""

  await prisma.$transaction(async (tx) => {
    await tx.lLMProvider.updateMany({ where: { isActive: true, purpose }, data: { isActive: false } })

    // apiKey is encrypted with a random IV, so it cannot be matched in a
    // `where`; filter on the other fields, then compare the decrypted keys.
    const candidates = await tx.lLMProvider.findMany({
      where: { provider: validated.provider, purpose, model: validated.model, baseUrl: validatedBaseUrl },
    })
    const existing = candidates.find((candidate) => candidate.apiKey === storedKey)

    if (existing) {
      await tx.lLMProvider.update({ where: { id: existing.id }, data: { isActive: true, ...settings } })
    } else {
      await tx.lLMProvider.create({
        data: {
          provider: validated.provider,
          purpose,
          apiKey: storedKey,
          model: validated.model,
          baseUrl: validatedBaseUrl,
          ...settings,
          isActive: true,
        },
      })
    }
  })

  logAuditEvent(AuditEventType.CONFIG_CHANGED, userId, {
    ...configDiff(
      `llm.${purpose}`,
      stored && auditedFields(stored),
      auditedFields({ provider: validated.provider, model: validated.model, baseUrl: validatedBaseUrl, ...settings, apiKey: storedKey }),
      { secretFields: ["apiKey"], urlFields: ["baseUrl"] }
    ),
    from: stored ? { provider: stored.provider, model: stored.model } : null,
    to: { provider: validated.provider, model: validated.model },
  })

  revalidatePath("/admin/settings")
  return ok(null)
}

/** Update the chat assistant's LLM provider (admin only). */
export const updateChatLLMProvider = adminAction({
  input: saveInputSchema,
  rateLimit: { name: "llm:models" },
  fallbackError: "Failed to update the chat LLM provider",
  handler: (input, { userId }) => updateLLMProviderForPurpose("chat", input, userId),
})

/** Update the Rewind LLM provider (admin only). */
export const updateWrappedLLMProvider = adminAction({
  input: saveInputSchema,
  rateLimit: { name: "llm:models" },
  fallbackError: "Failed to update the wrapped LLM provider",
  handler: (input, { userId }) => updateLLMProviderForPurpose("wrapped", input, userId),
})

/**
 * The models a provider lists (admin only, rate-limited). With no `provider`
 * it lists the purpose's active provider, for the prompt playground. A blank
 * key falls back to the stored one under the same rule as saving.
 */
export async function listLLMModels(data: z.input<typeof listInputSchema>): Promise<ListResult> {
  const userId = await adminUserId()
  if (!userId) return { success: false, error: "Admin access required" }

  const input = listInputSchema.safeParse(data)
  if (!input.success) return { success: false, error: "Invalid request" }

  if (!(await consume("llm:models", userId)).ok) return { success: false, error: RATE_LIMITED }

  try {
    const stored = await activeProvider(input.data.purpose)
    const configured = { configuredProvider: stored?.provider ?? null, configuredModel: stored?.model || null }
    const provider = input.data.provider ?? stored?.provider
    if (!provider) return { success: true, models: [], ...configured }

    const requested = input.data.provider ? input.data.baseUrl : (stored?.baseUrl ?? undefined)
    const baseUrl = baseUrlFor(provider, requested)
    if (provider === "openai-compatible") {
      if (!baseUrl || normalizeBaseUrl(baseUrl) === null) return { success: false, error: "Enter a valid base URL first" }
    }
    const apiKey = input.data.apiKey?.trim() || reusableKey(stored, provider, baseUrl)
    if (!apiKey && provider !== "openai-compatible") return { success: false, error: "Enter the API key first" }

    const parsedProvider = z.enum(LLM_PROVIDER_IDS).parse(provider)
    const loaded = await loadProviderModels({ provider: parsedProvider, apiKey, baseUrl })
    if (!loaded.success) return loaded
    return { success: true, models: loaded.models, ...configured }
  } catch (error) {
    logger.error("Failed to list LLM models", error, { purpose: input.data.purpose })
    return { success: false, error: "Failed to load models" }
  }
}
