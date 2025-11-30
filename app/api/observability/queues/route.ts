import { getRadarrQueue } from "@/lib/connections/radarr"
import { getSonarrQueue } from "@/lib/connections/sonarr"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { radarrQueueResponseSchema, type RadarrQueueRecord } from "@/lib/validations/radarr"
import { sonarrQueueResponseSchema, type SonarrQueueRecord } from "@/lib/validations/sonarr"
import { NextRequest, NextResponse } from "next/server"

export interface QueueItem {
  id: number
  source: "sonarr" | "radarr"
  title: string
  status: "downloading" | "queued" | "paused" | "failed" | "completed"
  progress: number
  size: number
  sizeLeft: number
  estimatedCompletionTime: string | null
  quality: string
}

export interface QueuesResponse {
  available: boolean
  items: QueueItem[]
  sonarrConfigured: boolean
  radarrConfigured: boolean
  sonarrUrl?: string
  radarrUrl?: string
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

    // Check configurations
    const [sonarr, radarr] = await Promise.all([
      prisma.sonarr.findFirst({ where: { isActive: true } }),
      prisma.radarr.findFirst({ where: { isActive: true } }),
    ])

    const sonarrConfigured = !!sonarr
    const radarrConfigured = !!radarr

    if (!sonarrConfigured && !radarrConfigured) {
      return NextResponse.json({
        available: false,
        items: [],
        sonarrConfigured: false,
        radarrConfigured: false,
        error: "Neither Sonarr nor Radarr configured",
      } satisfies QueuesResponse)
    }

    const items: QueueItem[] = []

    // Helper to extract records from validated queue response
    function extractSonarrRecords(data: unknown): SonarrQueueRecord[] {
      const validated = sonarrQueueResponseSchema.safeParse(data)
      if (!validated.success) {
        logError("OBSERVABILITY_SONARR_QUEUE_VALIDATION", validated.error)
        return []
      }
      return Array.isArray(validated.data) ? validated.data : validated.data.records || []
    }

    function extractRadarrRecords(data: unknown): RadarrQueueRecord[] {
      const validated = radarrQueueResponseSchema.safeParse(data)
      if (!validated.success) {
        logError("OBSERVABILITY_RADARR_QUEUE_VALIDATION", validated.error)
        return []
      }
      return Array.isArray(validated.data) ? validated.data : validated.data.records || []
    }

    // Fetch Sonarr queue
    if (sonarr) {
      try {
        const result = await getSonarrQueue({
          name: sonarr.name,
          url: sonarr.url,
          apiKey: sonarr.apiKey,
        })

        if (result.success && result.data) {
          const records = extractSonarrRecords(result.data)
          for (const item of records) {
            items.push({
              id: item.id,
              source: "sonarr",
              title: item.series?.title
                ? `${item.series.title} - ${item.episode?.title || `S${item.episode?.seasonNumber}E${item.episode?.episodeNumber}`}`
                : item.title || "Unknown",
              status: mapStatus(item.status, item.trackedDownloadStatus),
              progress: calculateProgress(item.size, item.sizeleft),
              size: item.size || 0,
              sizeLeft: item.sizeleft || 0,
              estimatedCompletionTime: item.estimatedCompletionTime || null,
              quality: item.quality?.quality?.name || "Unknown",
            })
          }
        } else if (!result.success) {
          logError("OBSERVABILITY_SONARR_QUEUE", new Error(result.error))
        }
      } catch (error) {
        logError("OBSERVABILITY_SONARR_QUEUE", error)
      }
    }

    // Fetch Radarr queue
    if (radarr) {
      try {
        const result = await getRadarrQueue({
          name: radarr.name,
          url: radarr.url,
          apiKey: radarr.apiKey,
        })

        if (result.success && result.data) {
          const records = extractRadarrRecords(result.data)
          for (const item of records) {
            items.push({
              id: item.id,
              source: "radarr",
              title: item.movie?.title || item.title || "Unknown",
              status: mapStatus(item.status, item.trackedDownloadStatus),
              progress: calculateProgress(item.size, item.sizeleft),
              size: item.size || 0,
              sizeLeft: item.sizeleft || 0,
              estimatedCompletionTime: item.estimatedCompletionTime || null,
              quality: item.quality?.quality?.name || "Unknown",
            })
          }
        } else if (!result.success) {
          logError("OBSERVABILITY_RADARR_QUEUE", new Error(result.error))
        }
      } catch (error) {
        logError("OBSERVABILITY_RADARR_QUEUE", error)
      }
    }

    // Sort by progress (downloading items first)
    items.sort((a, b) => {
      if (a.status === "downloading" && b.status !== "downloading") return -1
      if (b.status === "downloading" && a.status !== "downloading") return 1
      return b.progress - a.progress
    })

    return NextResponse.json({
      available: true,
      items,
      sonarrConfigured,
      radarrConfigured,
      sonarrUrl: sonarr ? (sonarr.publicUrl || sonarr.url) : undefined,
      radarrUrl: radarr ? (radarr.publicUrl || radarr.url) : undefined,
    } satisfies QueuesResponse)
  } catch (error) {
    logError("OBSERVABILITY_QUEUES", error)
    return NextResponse.json(
      {
        available: false,
        items: [],
        sonarrConfigured: false,
        radarrConfigured: false,
        error: "Failed to fetch queues",
      } satisfies QueuesResponse,
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

function mapStatus(
  status: string | undefined,
  trackedStatus: string | undefined
): QueueItem["status"] {
  if (trackedStatus === "warning" || trackedStatus === "error") return "failed"
  if (status === "completed") return "completed"
  if (status === "paused") return "paused"
  if (status === "downloading") return "downloading"
  return "queued"
}

function calculateProgress(size: number | undefined, sizeLeft: number | undefined): number {
  if (!size || size === 0) return 0
  const left = sizeLeft || 0
  return Math.round(((size - left) / size) * 100)
}
