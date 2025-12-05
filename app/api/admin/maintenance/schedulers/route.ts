/**
 * API route for viewing active maintenance rule schedulers.
 * Used for debugging scheduled job execution.
 */

import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { getActiveSchedulers } from "@/lib/maintenance/scheduler"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await adminRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    // Get active schedulers from BullMQ
    const schedulers = await getActiveSchedulers()

    // Fetch rule names for better debugging context
    const ruleIds = schedulers.map((s) => s.ruleId)
    const rules = await prisma.maintenanceRule.findMany({
      where: { id: { in: ruleIds } },
      select: { id: true, name: true, enabled: true },
    })

    const ruleMap = new Map(rules.map((r) => [r.id, r]))

    // Combine scheduler data with rule info
    const schedulersWithRules = schedulers.map((scheduler) => {
      const rule = ruleMap.get(scheduler.ruleId)
      return {
        ...scheduler,
        ruleName: rule?.name ?? null,
        ruleEnabled: rule?.enabled ?? null,
        next: scheduler.next?.toISOString() ?? null,
      }
    })

    return NextResponse.json({
      schedulers: schedulersWithRules,
      count: schedulersWithRules.length,
    })
  } catch (error) {
    logError("SCHEDULERS_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch schedulers"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
