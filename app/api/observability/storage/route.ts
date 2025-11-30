import { getSonarrDiskSpace } from "@/lib/connections/sonarr"
import { getRadarrDiskSpace } from "@/lib/connections/radarr"
import { getTautulliLibraries } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { NextRequest, NextResponse } from "next/server"

export interface DiskSpaceItem {
  path: string
  label: string
  freeSpace: number
  totalSpace: number
  usedSpace: number
  usedPercent: number
  source: "sonarr" | "radarr"
}

export interface LibraryInfo {
  sectionId: string
  sectionName: string
  sectionType: string
  count: number
}

export interface StorageResponse {
  available: boolean
  diskSpace: DiskSpaceItem[]
  libraries: LibraryInfo[]
  sonarrConfigured: boolean
  radarrConfigured: boolean
  tautulliConfigured: boolean
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
    const [sonarr, radarr, tautulli] = await Promise.all([
      prisma.sonarr.findFirst({ where: { isActive: true } }),
      prisma.radarr.findFirst({ where: { isActive: true } }),
      prisma.tautulli.findFirst({ where: { isActive: true } }),
    ])

    const sonarrConfigured = !!sonarr
    const radarrConfigured = !!radarr
    const tautulliConfigured = !!tautulli

    if (!sonarrConfigured && !radarrConfigured && !tautulliConfigured) {
      return NextResponse.json({
        available: false,
        diskSpace: [],
        libraries: [],
        sonarrConfigured: false,
        radarrConfigured: false,
        tautulliConfigured: false,
        error: "No services configured for storage metrics",
      } satisfies StorageResponse)
    }

    const diskSpace: DiskSpaceItem[] = []
    const libraries: LibraryInfo[] = []

    // Disk space item type
    interface DiskSpaceRecord {
      path?: string
      label?: string
      freeSpace?: number
      totalSpace?: number
    }

    // Fetch Sonarr disk space
    if (sonarr) {
      try {
        const result = await getSonarrDiskSpace({
          name: sonarr.name,
          url: sonarr.url,
          apiKey: sonarr.apiKey,
        })

        if (result.success && result.data) {
          const space = result.data as DiskSpaceRecord[]
          for (const disk of space || []) {
            const usedSpace = (disk.totalSpace || 0) - (disk.freeSpace || 0)
            const usedPercent = disk.totalSpace && disk.totalSpace > 0
              ? Math.round((usedSpace / disk.totalSpace) * 100)
              : 0

            diskSpace.push({
              path: disk.path || "Unknown",
              label: disk.label || disk.path || "Sonarr Storage",
              freeSpace: disk.freeSpace || 0,
              totalSpace: disk.totalSpace || 0,
              usedSpace,
              usedPercent,
              source: "sonarr",
            })
          }
        } else if (!result.success) {
          logError("OBSERVABILITY_SONARR_DISKSPACE", new Error(result.error))
        }
      } catch (error) {
        logError("OBSERVABILITY_SONARR_DISKSPACE", error)
      }
    }

    // Fetch Radarr disk space
    if (radarr) {
      try {
        const result = await getRadarrDiskSpace({
          name: radarr.name,
          url: radarr.url,
          apiKey: radarr.apiKey,
        })

        if (result.success && result.data) {
          const space = result.data as DiskSpaceRecord[]
          for (const disk of space || []) {
            // Check if this path is already added from Sonarr
            const existingPath = diskSpace.find(d => d.path === disk.path)
            if (existingPath) {
              // Update to show it's shared between both
              existingPath.label = `${existingPath.label} (Shared)`
              continue
            }

            const usedSpace = (disk.totalSpace || 0) - (disk.freeSpace || 0)
            const usedPercent = disk.totalSpace && disk.totalSpace > 0
              ? Math.round((usedSpace / disk.totalSpace) * 100)
              : 0

            diskSpace.push({
              path: disk.path || "Unknown",
              label: disk.label || disk.path || "Radarr Storage",
              freeSpace: disk.freeSpace || 0,
              totalSpace: disk.totalSpace || 0,
              usedSpace,
              usedPercent,
              source: "radarr",
            })
          }
        } else if (!result.success) {
          logError("OBSERVABILITY_RADARR_DISKSPACE", new Error(result.error))
        }
      } catch (error) {
        logError("OBSERVABILITY_RADARR_DISKSPACE", error)
      }
    }

    // Fetch Tautulli library info (using get_libraries which includes item counts)
    if (tautulli) {
      try {
        const result = await getTautulliLibraries({
          name: tautulli.name,
          url: tautulli.url,
          apiKey: tautulli.apiKey,
        })

        if (result.success && result.data) {
          const libraryData = result.data as { response?: { data?: Array<{
            section_id?: string | number
            section_name?: string
            section_type?: string
            count?: string | number
          }> } }
          const libList = libraryData.response?.data || []
          for (const lib of libList) {
            libraries.push({
              sectionId: lib.section_id?.toString() || "",
              sectionName: lib.section_name || "Unknown",
              sectionType: lib.section_type || "unknown",
              // get_libraries returns count as a string
              count: typeof lib.count === 'string' ? parseInt(lib.count, 10) : (lib.count || 0),
            })
          }
        } else if (!result.success) {
          logError("OBSERVABILITY_TAUTULLI_LIBRARIES", new Error(result.error))
        }
      } catch (error) {
        logError("OBSERVABILITY_TAUTULLI_LIBRARIES", error)
      }
    }

    // Sort disk space by used percent (highest first)
    diskSpace.sort((a, b) => b.usedPercent - a.usedPercent)

    return NextResponse.json({
      available: true,
      diskSpace,
      libraries,
      sonarrConfigured,
      radarrConfigured,
      tautulliConfigured,
    } satisfies StorageResponse)
  } catch (error) {
    logError("OBSERVABILITY_STORAGE", error)
    return NextResponse.json(
      {
        available: false,
        diskSpace: [],
        libraries: [],
        sonarrConfigured: false,
        radarrConfigured: false,
        tautulliConfigured: false,
        error: "Failed to fetch storage metrics",
      } satisfies StorageResponse,
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}
