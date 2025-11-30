import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { getActiveLLMProvider } from "@/lib/services/service-helpers"
import { MODEL_PRICING } from "@/lib/llm/pricing"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await adminRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Require admin authentication
    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    // Get all model names from MODEL_PRICING (already filtered to text-only base models)
    const models = Object.keys(MODEL_PRICING).sort()

    // Get configured model from active LLM provider
    const llmProviderService = await getActiveLLMProvider("chat")

    const configuredModel = llmProviderService?.config.model || null

    return NextResponse.json({ models, configuredModel })
  } catch (error) {
    logError("ADMIN_MODELS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch models"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

