"use server"

/**
 * LLM provider configuration management
 *
 * Functions for managing LLM provider settings (chat and wrapped)
 */

import { requireAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

/**
 * Update LLM provider configuration (admin only)
 * @deprecated Use updateChatLLMProvider or updateWrappedLLMProvider instead
 */
export async function updateLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
  // For backward compatibility, update wrapped provider
  return updateWrappedLLMProvider(data)
}

/**
 * Update chat LLM provider configuration (admin only)
 */
export async function updateChatLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
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
      // Deactivate any existing chat providers
      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose: "chat" },
        data: { isActive: false },
      })

      // Check if there's an existing provider with same config
      const existing = await tx.lLMProvider.findFirst({
        where: {
          provider: validated.provider,
          purpose: "chat",
          apiKey: validated.apiKey,
          model: model,
        },
      })

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
            purpose: "chat",
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
    return { success: false, error: "Failed to update chat LLM provider configuration" }
  }
}

/**
 * Update wrapped LLM provider configuration (admin only)
 */
export async function updateWrappedLLMProvider(data: { provider: string; apiKey: string; model: string; temperature?: number; maxTokens?: number }) {
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
      // Deactivate any existing wrapped providers
      await tx.lLMProvider.updateMany({
        where: { isActive: true, purpose: "wrapped" },
        data: { isActive: false },
      })

      // Check if there's an existing provider with same config
      const existing = await tx.lLMProvider.findFirst({
        where: {
          provider: validated.provider,
          purpose: "wrapped",
          apiKey: validated.apiKey,
          model: model,
        },
      })

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
            purpose: "wrapped",
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
    return { success: false, error: "Failed to update wrapped LLM provider configuration" }
  }
}
