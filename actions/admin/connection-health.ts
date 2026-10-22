"use server"

import { updateTag } from "next/cache"

import { adminAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { getSettingsHealth } from "@/lib/settings/connection-health"
import { CONNECTION_HEALTH_TAG } from "@/lib/settings/connection-status"

/**
 * "Test all connections" and each section's Test connection on the settings
 * page (P10.19): expires the cached service checks and runs them again with
 * the saved settings. Returns statuses and codes, never a tester's message.
 */
export const recheckConnections = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not check the connections",
  handler: async () => {
    updateTag(CONNECTION_HEALTH_TAG)
    return ok(await getSettingsHealth())
  },
})
