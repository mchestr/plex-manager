import { getAllOverseerrRequests, getOverseerrMediaDetails } from "@/lib/connections/overseerr"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { NextRequest, NextResponse } from "next/server"

interface OverseerrRequest {
  id: number
  status: number
  type: string
  createdAt?: string
  media?: {
    id?: number
    tmdbId?: number
    mediaType?: string
  }
  requestedBy?: {
    displayName?: string
    email?: string
  }
}

// Simple in-memory cache for media titles to avoid rate limiting
const titleCache = new Map<string, { title: string; expiresAt: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getCachedTitle(tmdbId: number, mediaType: string): string | null {
  const key = `${mediaType}:${tmdbId}`
  const cached = titleCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.title
  }
  if (cached) {
    titleCache.delete(key)
  }
  return null
}

function setCachedTitle(tmdbId: number, mediaType: string, title: string): void {
  const key = `${mediaType}:${tmdbId}`
  titleCache.set(key, { title, expiresAt: Date.now() + CACHE_TTL_MS })
}

export interface RequestItem {
  id: number
  type: "movie" | "tv"
  title: string
  status: "pending" | "approved" | "available" | "declined"
  requestedBy: string
  requestedAt: string
  tmdbId?: number
}

export interface RequestsStatsResponse {
  available: boolean
  configured: boolean
  recentRequests: RequestItem[]
  stats: {
    pending: number
    approved: number
    available: number
    declined: number
    total: number
  }
  overseerrUrl?: string
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

    // Check if Overseerr is configured
    const overseerr = await prisma.overseerr.findFirst({ where: { isActive: true } })

    if (!overseerr) {
      return NextResponse.json({
        available: false,
        configured: false,
        recentRequests: [],
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        error: "Overseerr not configured",
      } satisfies RequestsStatsResponse)
    }

    try {
      // Fetch recent requests (last 50 to get good stats)
      const requestsData = await getAllOverseerrRequests(
        {
          name: overseerr.name,
          url: overseerr.url,
          apiKey: overseerr.apiKey,
        },
        50
      )

      const requests: OverseerrRequest[] = requestsData.results || []

      // Calculate stats
      const stats = {
        pending: 0,
        approved: 0,
        available: 0,
        declined: 0,
        total: requests.length,
      }

      // First pass: calculate stats and identify requests to display
      const requestsToDisplay: Array<{
        req: OverseerrRequest
        status: RequestItem["status"]
      }> = []

      for (const req of requests) {
        // Map status (Overseerr uses: 1=pending, 2=approved, 3=declined, 4=available)
        let status: RequestItem["status"] = "pending"
        if (req.status === 1) {
          status = "pending"
          stats.pending++
        } else if (req.status === 2) {
          status = "approved"
          stats.approved++
        } else if (req.status === 3) {
          status = "declined"
          stats.declined++
        } else if (req.status === 4 || req.status === 5) {
          status = "available"
          stats.available++
        }

        // Only add recent items (first 10) to display list
        if (requestsToDisplay.length < 10) {
          requestsToDisplay.push({ req, status })
        }
      }

      // Fetch media details for requests we'll display (to get titles)
      const config = {
        name: overseerr.name,
        url: overseerr.url,
        apiKey: overseerr.apiKey,
      }

      const recentRequests: RequestItem[] = await Promise.all(
        requestsToDisplay.map(async ({ req, status }) => {
          let title = "Unknown"
          const mediaType = req.type === "movie" ? "movie" : "tv"

          // Try to get title from cache first
          if (req.media?.tmdbId) {
            const cachedTitle = getCachedTitle(req.media.tmdbId, mediaType)
            if (cachedTitle) {
              title = cachedTitle
            } else {
              // Fetch media details to get the title
              try {
                const details = await getOverseerrMediaDetails(
                  config,
                  req.media.tmdbId,
                  mediaType
                )
                // Movies use 'title', TV shows use 'name'
                title = details.title || details.name || details.originalTitle || details.originalName || "Unknown"
                // Cache the result
                setCachedTitle(req.media.tmdbId, mediaType, title)
              } catch {
                // If fetching details fails, keep "Unknown"
              }
            }
          }

          return {
            id: req.id,
            type: mediaType as "movie" | "tv",
            title,
            status,
            requestedBy: req.requestedBy?.displayName || req.requestedBy?.email || "Unknown",
            requestedAt: req.createdAt || new Date().toISOString(),
            tmdbId: req.media?.tmdbId,
          }
        })
      )

      return NextResponse.json({
        available: true,
        configured: true,
        recentRequests,
        stats,
        overseerrUrl: overseerr.publicUrl || overseerr.url,
      } satisfies RequestsStatsResponse)
    } catch (error) {
      logError("OBSERVABILITY_OVERSEERR_REQUESTS", error)
      return NextResponse.json({
        available: false,
        configured: true,
        recentRequests: [],
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        error: "Failed to fetch Overseerr data",
      } satisfies RequestsStatsResponse)
    }
  } catch (error) {
    logError("OBSERVABILITY_REQUESTS", error)
    return NextResponse.json(
      {
        available: false,
        configured: false,
        recentRequests: [],
        stats: { pending: 0, approved: 0, available: 0, declined: 0, total: 0 },
        error: "Failed to fetch request metrics",
      } satisfies RequestsStatsResponse,
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
