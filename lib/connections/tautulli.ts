import { type TautulliParsed } from "@/lib/validations/tautulli";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";

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

export async function getTautulliActivity(config: TautulliParsed) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_activity`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli activity error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliServerInfo(config: TautulliParsed) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_server_info`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli server info error: ${response.statusText}`)
  return response.json()
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
) {
  let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_media_info&section_id=${sectionId}`
  if (options?.orderColumn) url += `&order_column=${options.orderColumn}`
  if (options?.start !== undefined) url += `&start=${options.start}`
  if (options?.length !== undefined) url += `&length=${options.length}`
  if (options?.search) url += `&search=${encodeURIComponent(options.search)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli library media info error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliLibraryNames(config: TautulliParsed) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_names`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli library names error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliUsers(config: TautulliParsed) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_users`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli users error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliHistory(config: TautulliParsed, userId?: number, limit = 20) {
  let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_history&length=${limit}`
  if (userId) url += `&user_id=${userId}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli history error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliRecentlyWatched(config: TautulliParsed, limit = 20) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_recently_watched&length=${limit}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli recently watched error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliMostWatched(config: TautulliParsed, limit = 20) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_most_watched&length=${limit}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli most watched error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliTopUsers(config: TautulliParsed, limit = 10) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_top_users&length=${limit}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli top users error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliUserWatchTimeStats(config: TautulliParsed, userId?: number) {
  let url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_user_watch_time_stats`
  if (userId) url += `&user_id=${userId}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli user watch time stats error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliMediaWatchStats(config: TautulliParsed, ratingKey: string | number) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_metadata&rating_key=${ratingKey}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli media watch stats error: ${response.statusText}`)
  return response.json()
}

export async function getTautulliUnwatchedMedia(config: TautulliParsed, sectionId: string | number) {
  const url = `${config.url}/api/v2?apikey=${config.apiKey}&cmd=get_library_media_info&section_id=${sectionId}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Tautulli unwatched media error: ${response.statusText}`)
  return response.json()
}
