import { z } from "zod"

import { testServiceConnection } from "@/lib/connections/connection-test"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

/**
 * Shared HTTP helpers for the Sonarr and Radarr v3 API clients.
 *
 * Sonarr and Radarr expose structurally identical REST APIs (same auth header,
 * same `/api/v3/...` shape, same JSON envelope), so both clients call through
 * here and `serviceFetch` supplies the timeout, safe redirects and key-free
 * errors.
 */

interface ArrConfig {
  url: string
  apiKey: string
}

type ArrService = "Sonarr" | "Radarr"

/**
 * GET an *arr v3 endpoint as a {@link ConnectionResult}.
 *
 * @param service - "Sonarr" or "Radarr", for messages and logs.
 * @param config - Server URL + API key.
 * @param path - Path beginning with `/` (e.g. `/api/v3/queue`), already URL-encoded.
 */
export async function arrGet(service: ArrService, config: ArrConfig, path: string): Promise<ConnectionResult<unknown>> {
  const result = await serviceFetch({
    service,
    url: `${config.url}${path}`,
    headers: { "X-Api-Key": config.apiKey },
    schema: z.unknown(),
  })
  return toConnectionResult(service, result)
}

/** The setup forms' connection test: `/api/v3/system/status` must answer with an object. */
export async function testArrConnection(service: ArrService, config: ArrConfig): Promise<{ success: boolean; error?: string }> {
  return testServiceConnection(service, () =>
    serviceFetch({
      service,
      url: `${config.url}/api/v3/system/status`,
      headers: { "X-Api-Key": config.apiKey },
      schema: z.looseObject({}),
    })
  )
}
