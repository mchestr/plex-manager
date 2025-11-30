import { getTautulliActivity } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { tautulliActivityResponseSchema } from "@/lib/validations/tautulli"
import { NextRequest, NextResponse } from "next/server"

export interface PlexSession {
  sessionId: string
  user: string
  userThumb: string | null
  title: string
  grandparentTitle: string | null
  mediaType: "movie" | "episode" | "track"
  progress: number
  state: "playing" | "paused" | "buffering"
  player: string
  quality: string
  duration: number
  viewOffset: number
}

export interface SessionsResponse {
  available: boolean
  sessions: PlexSession[]
  streamCount: number
  tautulliUrl?: string
  error?: string
}

export const dynamic = "force-dynamic"

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

    // Check if Tautulli is configured
    const tautulli = await prisma.tautulli.findFirst({ where: { isActive: true } })

    if (!tautulli) {
      return NextResponse.json({
        available: false,
        sessions: [],
        streamCount: 0,
        error: "Tautulli not configured",
      } satisfies SessionsResponse)
    }

    // Fetch activity from Tautulli
    const result = await getTautulliActivity({
      name: tautulli.name,
      url: tautulli.url,
      apiKey: tautulli.apiKey,
    })

    if (!result.success) {
      return NextResponse.json({
        available: false,
        sessions: [],
        streamCount: 0,
        error: result.error || "Failed to fetch Tautulli activity",
      } satisfies SessionsResponse)
    }

    // Validate and parse the response
    const validatedActivity = tautulliActivityResponseSchema.safeParse(result.data)

    if (!validatedActivity.success) {
      logError("OBSERVABILITY_SESSIONS_VALIDATION", validatedActivity.error)
      return NextResponse.json({
        available: false,
        sessions: [],
        streamCount: 0,
        error: "Invalid response format from Tautulli",
      } satisfies SessionsResponse)
    }

    const activity = validatedActivity.data
    const sessions: PlexSession[] = (activity?.response?.data?.sessions || []).map(
      (session) => ({
        sessionId: session.session_id || session.session_key || "",
        user: session.user || "Unknown",
        userThumb: session.user_thumb || null,
        title: session.title || "Unknown",
        grandparentTitle: session.grandparent_title || null,
        mediaType: session.media_type === "movie" ? "movie" : session.media_type === "episode" ? "episode" : "track",
        progress: Number(session.progress_percent || 0),
        state: session.state === "playing" ? "playing" : session.state === "paused" ? "paused" : "buffering",
        player: session.player || "Unknown",
        quality: session.quality_profile || session.stream_video_full_resolution || "Unknown",
        duration: Number(session.duration || 0),
        viewOffset: Number(session.view_offset || 0),
      })
    )

    return NextResponse.json({
      available: true,
      sessions,
      streamCount: activity?.response?.data?.stream_count || sessions.length,
      tautulliUrl: tautulli.publicUrl || tautulli.url,
    } satisfies SessionsResponse)
  } catch (error) {
    logError("OBSERVABILITY_SESSIONS", error)
    return NextResponse.json(
      {
        available: false,
        sessions: [],
        streamCount: 0,
        error: "Failed to fetch sessions",
      } satisfies SessionsResponse,
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
