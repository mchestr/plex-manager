"use server"

/**
 * LLM provider configuration management
 *
 * Functions for managing LLM provider settings (chat and wrapped)
 */

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

type LLMProviderPurpose = "chat" | "wrapped"

type LLMProviderInput = {
  provider: string
  apiKey: string
  model: string
  temperature?: number
  maxTokens?: number
}

/**
 * Shared implementation for updating an LLM provider for a given purpose.
 * Not exported: only the two thin per-purpose Server Actions below are public.
 * Validates input, verifies connectivity, then deactivates any existing active
 * provider for the purpose and reactivates-or-creates the requested one.
 */
async function updateLLMProviderForPurpose(purpose: LLMProviderPurpose, data: LLMProviderInput) {
  await requireAdmin()

  try {
    const { llmProviderSchema } = await import("@/lib/validations/llm-provider")
    const { testLLMProviderConnection } = await import("@/lib/connections/llm-provider")
    const { revalidatePath } = await import("next/cache")

    // Ensure model is provided
    if (!data.model) {
      return { success: false, error: "Model is required" }
    }

    const validated = llmProviderSchema.parse({ ...data, model: data.model })

    // Test connection before saving
    const connectionTest = await testLLMProviderConnection(validated)
    if (!connectionTest.success) {
      return { success: false, error: connectionTest.error || "Failed to connect to LLM provider" }
    }

    // Type assertion: we've already checked that data.model exists
    const model = validated.model!

    await prisma.$transaction(async (tx) => {
      // Deactivate any existing providers for this purpose
      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose },
        data: { isActive: false },
      })

      // Check if there's an existing provider with same config. apiKey is
      // encrypted at rest with a random IV, so it cannot be matched in a `where`
      // clause; filter on the non-secret fields, then compare the (auto-decrypted)
      // apiKey in application code.
      const candidates = await tx.lLMProvider.findMany({
        where: {
          provider: validated.provider,
          purpose,
          model: model,
        },
      })
      const existing = candidates.find((c) => c.apiKey === validated.apiKey)

      if (existing) {
        // Reactivate existing provider and update temperature and maxTokens
        await tx.lLMProvider.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
          },
        })
      } else {
        // Create new provider configuration
        await tx.lLMProvider.create({
          data: {
            provider: validated.provider,
            purpose,
            apiKey: validated.apiKey,
            model: model,
            temperature: validated.temperature ?? null,
            maxTokens: validated.maxTokens ?? null,
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
    return { success: false, error: `Failed to update ${purpose} LLM provider configuration` }
  }
}

/**
 * Update chat LLM provider configuration (admin only)
 */
export async function updateChatLLMProvider(data: LLMProviderInput) {
  return updateLLMProviderForPurpose("chat", data)
}

/**
 * Update wrapped LLM provider configuration (admin only)
 */
export async function updateWrappedLLMProvider(data: LLMProviderInput) {
  return updateLLMProviderForPurpose("wrapped", data)
}
