import { type TautulliParsed } from "@/lib/validations/tautulli";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";
import { type ConnectionResult } from "@/types/connection";

export async function testTautulliConnection(config: TautulliParsed): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_server_info`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key" }
      }
      if (response.status === 404) {
        return { success: false, error: "Tautulli server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = await response.json()

    // Check if Tautulli API returned an error
    if (data.response?.result === "error") {
      return { success: false, error: data.response?.message || "Tautulli API error" }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Tautulli server" }
  }
}

export async function getTautulliActivity(config: TautulliParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_activity`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli activity error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli activity" }
  }
}

export async function getTautulliServerInfo(config: TautulliParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_server_info`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli server info error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli server info" }
  }
}

export async function getTautulliLibraryMediaInfo(
  config: TautulliParsed,
  sectionId: string | number,
  options?: {
    orderColumn?: string
    start?: number
    length?: number
    search?: string
  }
): Promise<ConnectionResult<unknown>> {
  try {
    let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_media_info&section_id=${sectionId}`
    if (options?.orderColumn) url += `&order_column=${options.orderColumn}`
    if (options?.start !== undefined) url += `&start=${options.start}`
    if (options?.length !== undefined) url += `&length=${options.length}`
    if (options?.search) url += `&search=${encodeURIComponent(options.search)}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli library media info error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli library media info" }
  }
}

export async function getTautulliLibraryNames(config: TautulliParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_names`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli library names error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli library names" }
  }
}

export async function getTautulliUsers(config: TautulliParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_users`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli users error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli users" }
  }
}

export async function getTautulliHistory(config: TautulliParsed, userId?: number, limit = 20): Promise<ConnectionResult<unknown>> {
  try {
    let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_history&length=${limit}`
    if (userId) url += `&user_id=${userId}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli history error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli history" }
  }
}

export async function getTautulliRecentlyWatched(config: TautulliParsed, limit = 20): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_recently_watched&length=${limit}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli recently watched error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli recently watched" }
  }
}

export async function getTautulliMostWatched(config: TautulliParsed, limit = 20): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_most_watched&length=${limit}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli most watched error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli most watched" }
  }
}

export async function getTautulliTopUsers(config: TautulliParsed, limit = 10): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_top_users&length=${limit}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli top users error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli top users" }
  }
}

export async function getTautulliUserWatchTimeStats(config: TautulliParsed, userId?: number): Promise<ConnectionResult<unknown>> {
  try {
    let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_user_watch_time_stats`
    if (userId) url += `&user_id=${userId}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli user watch time stats error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli user watch time stats" }
  }
}

export async function getTautulliMediaWatchStats(config: TautulliParsed, ratingKey: string | number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_metadata&rating_key=${ratingKey}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli media watch stats error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli media watch stats" }
  }
}

export async function getTautulliUnwatchedMedia(config: TautulliParsed, sectionId: string | number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_media_info&section_id=${sectionId}`
    const response = await fetch(url)
    if (!response.ok) {
      return { success: false, error: `Tautulli unwatched media error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Tautulli unwatched media" }
  }
}
