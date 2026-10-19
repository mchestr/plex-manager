"use server"

/**
 * LLM provider settings for the two purposes (chat assistant and Rewind).
 *
 * The base URL of an OpenAI-compatible server is an admin-only SSRF surface
 * (SEC-44), so only these `requireAdmin` actions accept one. A blank API key
 * keeps the stored key only while the provider and the base URL's origin are
 * unchanged; otherwise the key must be entered again, so a stored key is never
 * sent to a new address.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { loadProviderModels, testLLMProviderConnection } from "@/lib/connections/llm-provider"
import type { LLMProvider } from "@/lib/generated/prisma/client"
import { requireAdmin } from "@/lib/admin"
import { lookupModel } from "@/lib/llm/models"
import { LLM_PROVIDER_IDS } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { createLogger } from "@/lib/utils/logger"
import { EFFORT_LEVELS, llmProviderSchema } from "@/lib/validations/llm-provider"
import { normalizeBaseUrl } from "@/lib/validations/shared-schemas"

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

export type LLMProviderFormInput = z.input<typeof saveInputSchema>

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

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * The stored key, when it may be reused: same provider, and for an
 * OpenAI-compatible server, the same base-URL origin.
 *
 * @internal
 */
function reusableKey(stored: LLMProvider | null, provider: string, baseUrl: string | undefined): string | undefined {
  if (!stored || stored.provider !== provider) return undefined
  if (originOf(stored.baseUrl) !== originOf(baseUrl)) return undefined
  return stored.apiKey || undefined
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

async function updateLLMProviderForPurpose(purpose: LLMProviderPurpose, data: unknown) {
  const userId = await adminUserId()
  if (!userId) return { success: false, error: "Admin access required" }

  const input = saveInputSchema.safeParse(data)
  if (!input.success) return { success: false, error: input.error.issues[0]?.message ?? "Invalid provider settings" }

  if (!(await consume("llm:models", userId)).ok) return { success: false, error: RATE_LIMITED }

  try {
    const { provider, customModel } = input.data
    const baseUrl = baseUrlFor(provider, input.data.baseUrl)
    const stored = await activeProvider(purpose)
    const submittedKey = input.data.apiKey?.trim()
    const apiKey = submittedKey || reusableKey(stored, provider, baseUrl) || (provider === "openai-compatible" ? undefined : "")

    const parsed = llmProviderSchema.safeParse({ ...input.data, apiKey, baseUrl })
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid provider settings"
      // A blank key that cannot be reused reads as "API key is required"; say why
      const keyIssue = parsed.error.issues.some((issue) => issue.path[0] === "apiKey")
      const changed = keyIssue && !submittedKey && stored?.apiKey
      return { success: false, error: changed ? "Enter the API key again: the provider or its address changed." : message }
    }
    const validated = parsed.data
    const validatedBaseUrl = validated.provider === "openai-compatible" ? validated.baseUrl : null

    const connection = await testLLMProviderConnection(
      { provider: validated.provider, apiKey: validated.apiKey, baseUrl: validatedBaseUrl ?? undefined, model: validated.model },
      { customModel }
    )
    if (!connection.success) return { success: false, error: connection.error ?? "Failed to connect to the LLM provider" }

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

    logAuditEvent(AuditEventType.LLM_PROVIDER_CHANGED, userId, {
      purpose,
      from: stored ? { provider: stored.provider, model: stored.model, baseUrlOrigin: originOf(stored.baseUrl) } : null,
      to: { provider: validated.provider, model: validated.model, baseUrlOrigin: originOf(validatedBaseUrl) },
      keyChanged: Boolean(submittedKey),
    })

    revalidatePath("/admin/settings")
    return { success: true }
  } catch (error) {
    logger.error("Failed to save the LLM provider", error, { purpose })
    return { success: false, error: `Failed to update the ${purpose} LLM provider` }
  }
}

/** Update the chat assistant's LLM provider (admin only). */
export async function updateChatLLMProvider(data: LLMProviderFormInput) {
  return updateLLMProviderForPurpose("chat", data)
}

/** Update the Rewind LLM provider (admin only). */
export async function updateWrappedLLMProvider(data: LLMProviderFormInput) {
  return updateLLMProviderForPurpose("wrapped", data)
}

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
