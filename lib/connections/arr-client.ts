import { type ConnectionResult } from "@/types/connection"

/**
 * Shared HTTP helpers for the Sonarr and Radarr v3 API clients.
 *
 * Sonarr and Radarr expose structurally identical REST APIs (same auth header,
 * same `/api/v3/...` shape, same JSON envelope). These helpers centralize the
 * request/error-handling boilerplate that was previously copy-pasted across
 * every read function in both clients, so auth, error normalization, and JSON
 * parsing live in one place.
 */

interface ArrConfig {
  url: string
  apiKey: string
}

/**
 * Perform a GET request against an *arr v3 endpoint and normalize the result
 * into a {@link ConnectionResult}.
 *
 * @param config - Server URL + API key.
 * @param path - Path beginning with `/` (e.g. `/api/v3/queue`), already URL-encoded.
 * @param errorLabel - Prefix for the non-OK error message, e.g. `"Sonarr queue error"`.
 * @param fallback - Message used when a non-Error value is thrown (e.g. `"Failed to get Sonarr queue"`).
 */
export async function arrGet(
  config: ArrConfig,
  path: string,
  errorLabel: string,
  fallback: string
): Promise<ConnectionResult<unknown>> {
  try {
    const response = await fetch(`${config.url}${path}`, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `${errorLabel}: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: fallback }
  }
}
