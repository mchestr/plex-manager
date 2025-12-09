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

    // Build a set of timestamps that have data
    const dataTimestamps = new Set<number>()
    for (const series of result.data.result) {
      if (series.values) {
        for (const [timestamp] of series.values) {
          // Round to hour boundary
          const hourTimestamp = Math.floor(timestamp / 3600) * 3600
          dataTimestamps.add(hourTimestamp)
        }
      }
    }

    // Generate segments for each hour in the range
    const segments: StatusSegment[] = []
    let currentTime = Math.floor(startTime / 3600) * 3600 // Round to hour boundary
    const endHour = Math.floor(endTime / 3600) * 3600

    while (currentTime <= endHour) {
      const hasData = dataTimestamps.has(currentTime)
      segments.push({
        timestamp: currentTime,
        status: hasData ? "up" : "down",
      })
      currentTime += 3600 // Move to next hour
    }

    // Calculate overall status based on last 24 hours
    const last24Hours = segments.slice(-24)
    const upCount = last24Hours.filter((s) => s.status === "up").length
    const upPercentage = (upCount / last24Hours.length) * 100

    let overallStatus: StatusData["overallStatus"]
    if (upPercentage >= 95) {
      overallStatus = "operational"
    } else if (upPercentage >= 50) {
      overallStatus = "issues"
    } else {
      overallStatus = "down"
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
