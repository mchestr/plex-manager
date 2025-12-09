"use server"

import { prisma } from "@/lib/prisma"
import { queryPrometheusRange } from "@/lib/connections/prometheus"
import type { PrometheusParsed } from "@/lib/validations/prometheus"

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
 * Fetch Prometheus status data for the dashboard background
 * Queries the last 7 days with 1-hour resolution (168 data points)
 */
export async function getPrometheusStatus(): Promise<StatusData> {
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
    console.error("Error fetching Prometheus status:", error)
    return {
      isConfigured: false,
      serviceName: "",
      segments: [],
      overallStatus: "unknown",
    }
  }
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
