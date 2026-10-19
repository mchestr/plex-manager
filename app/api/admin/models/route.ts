import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { listKnownModels, type LLMProviderId } from "@/lib/llm/models"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await limitRequest("admin", request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Require admin authentication
    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    // The configured model and the known models of its provider
    const llmProvider = await prisma.lLMProvider.findFirst({
      where: { isActive: true },
      select: { model: true, provider: true },
    })

    const configuredProvider = (llmProvider?.provider ?? "openai") as LLMProviderId
    const models = listKnownModels(configuredProvider).map((info) => info.id).sort()
    const configuredModel = llmProvider?.model || null

    return NextResponse.json({ models, configuredModel, configuredProvider })
  } catch (error) {
    logError("ADMIN_MODELS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch models"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

