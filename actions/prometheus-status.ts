"use server"

import { prisma } from "@/lib/prisma"
import { queryPrometheusRange } from "@/lib/connections/prometheus"
import type { PrometheusParsed } from "@/lib/validations/prometheus"
import { createLogger } from "@/lib/utils/logger"
import { unstable_cache } from "next/cache"

const logger = createLogger("prometheus-status")

// Cache revalidation time in seconds (5 minutes)
const CACHE_REVALIDATE_SECONDS = 5 * 60

/**
 * Status for a single hour segment
 */
export interface StatusSegment {
  timestamp: number // Unix timestamp (seconds) for the hour start
  status: "up" | "down" | "unknown"
}

/**
 * Complete status data for the dashboard background
 */
export interface StatusData {
  isConfigured: boolean
  serviceName: string
  segments: StatusSegment[] // 168 hourly segments (7 days × 24 hours)
  overallStatus: "operational" | "issues" | "down" | "unknown"
}

/**
 * Internal function to fetch Prometheus status data
 * Queries the last 7 days with 1-hour resolution (168 data points)
 */
async function fetchPrometheusStatusInternal(): Promise<StatusData> {
  try {
    // Get active Prometheus configuration
    const prometheus = await prisma.prometheus.findFirst({
      where: { isActive: true },
    })

    if (!prometheus) {
      return {
        isConfigured: false,
        serviceName: "",
        segments: [],
        overallStatus: "unknown",
      }
    }

    const config: PrometheusParsed = {
      name: prometheus.name,
      url: prometheus.url,
      query: prometheus.query,
    }

    // Calculate time range: last 7 days
    const now = new Date()
    const endTime = Math.floor(now.getTime() / 1000)
    const startTime = endTime - 7 * 24 * 60 * 60 // 7 days ago

    // Query Prometheus
    const result = await queryPrometheusRange(config, startTime, endTime, "1h")

    if (!result.success || !result.data) {
      return {
        isConfigured: true,
        serviceName: prometheus.name,
        segments: generateUnknownSegments(startTime, endTime),
        overallStatus: "unknown",
      }
    }

    // Build a map of timestamps to their status values
    // For each hour, we track whether we've seen an "up" (value >= 1) or "down" (value == 0)
    const timestampStatus = new Map<number, "up" | "down">()

    for (const series of result.data.result) {
      if (series.values) {
        for (const [timestamp, valueStr] of series.values) {
          // Round to hour boundary
          const hourTimestamp = Math.floor(timestamp / 3600) * 3600
          const value = parseFloat(valueStr)

          // Determine status based on value (typically 1 = up, 0 = down for `up{}` queries)
          const status: "up" | "down" = value >= 1 ? "up" : "down"

          // If we already have a status for this hour, keep "up" if either is "up"
          // This handles cases where there are multiple data points in an hour
          const existing = timestampStatus.get(hourTimestamp)
          if (!existing || status === "up") {
            timestampStatus.set(hourTimestamp, status)
          }
        }
      }
    }

    // Generate segments for each hour in the range
    const segments: StatusSegment[] = []
    let currentTime = Math.floor(startTime / 3600) * 3600 // Round to hour boundary
    const endHour = Math.floor(endTime / 3600) * 3600

    while (currentTime <= endHour) {
      const status = timestampStatus.get(currentTime)
      segments.push({
        timestamp: currentTime,
        // If we have data, use its status; if no data, mark as unknown (not down)
        status: status ?? "unknown",
      })
      currentTime += 3600 // Move to next hour
    }

    // Calculate overall status based on last 24 hours
    // Only consider segments with known status (up or down), ignore unknown
    const last24Hours = segments.slice(-24)
    const knownSegments = last24Hours.filter((s) => s.status !== "unknown")
    const upCount = knownSegments.filter((s) => s.status === "up").length

    let overallStatus: StatusData["overallStatus"]
    if (knownSegments.length === 0) {
      // No known data in last 24 hours
      overallStatus = "unknown"
    } else {
      const upPercentage = (upCount / knownSegments.length) * 100
      if (upPercentage >= 95) {
        overallStatus = "operational"
      } else if (upPercentage >= 50) {
        overallStatus = "issues"
      } else {
        overallStatus = "down"
      }
    }

    return {
      isConfigured: true,
      serviceName: prometheus.name,
      segments,
      overallStatus,
    }
  } catch (error) {
    logger.error("Error fetching Prometheus status", { error })
    // Get the prometheus config to return service name even on error
    // Use a separate try-catch to avoid nested errors
    let serviceName = ""
    try {
      const prometheus = await prisma.prometheus.findFirst({
        where: { isActive: true },
        select: { name: true },
      })
      serviceName = prometheus?.name ?? ""
    } catch {
      // Ignore error getting name
    }
    // Calculate time range for unknown segments
    const now = new Date()
    const endTime = Math.floor(now.getTime() / 1000)
    const startTime = endTime - 7 * 24 * 60 * 60
    return {
      isConfigured: serviceName !== "",
      serviceName,
      segments: generateUnknownSegments(startTime, endTime),
      overallStatus: "unknown",
    }
  }
}

/**
 * Cached version of fetchPrometheusStatusInternal
 * Caches results for 5 minutes to reduce Prometheus API load
 */
const getCachedPrometheusStatus = unstable_cache(
  fetchPrometheusStatusInternal,
  ["prometheus-status"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: ["prometheus-status"],
  }
)

/**
 * Fetch Prometheus status data for the dashboard background
 * Results are cached for 5 minutes to reduce load on Prometheus
 * Queries the last 7 days with 1-hour resolution (168 data points)
 */
export async function getPrometheusStatus(): Promise<StatusData> {
  return getCachedPrometheusStatus()
}

/**
 * Generate unknown status segments for the time range
 * Used when Prometheus query fails
 */
function generateUnknownSegments(startTime: number, endTime: number): StatusSegment[] {
  const segments: StatusSegment[] = []
  let currentTime = Math.floor(startTime / 3600) * 3600
  const endHour = Math.floor(endTime / 3600) * 3600

  while (currentTime <= endHour) {
    segments.push({
      timestamp: currentTime,
      status: "unknown",
    })
    currentTime += 3600
  }

  return segments
}
