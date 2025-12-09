"use client"

import type { StatusData, StatusSegment } from "@/actions/prometheus-status"
import { useState } from "react"

interface StatusFooterProps {
  status: StatusData
}

/**
 * Footer status bar showing Prometheus status
 * Renders 168 thin vertical bars (7 days × 24 hours) in a compact footer
 */
export function StatusFooter({ status }: StatusFooterProps) {
  const [hoveredSegment, setHoveredSegment] = useState<StatusSegment | null>(null)

  // Don't render if not configured or no segments
  if (!status.isConfigured || status.segments.length === 0) {
    return null
  }

  const { dotColor, label } = getOverallStatusStyles(status.overallStatus)

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50"
      data-testid="status-footer"
    >
      {/* Status bars */}
      <div className="h-2 flex">
        {status.segments.map((segment, index) => (
          <StatusBar
            key={segment.timestamp}
            segment={segment}
            index={index}
            onHover={setHoveredSegment}
          />
        ))}
      </div>

      {/* Status label */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="text-xs text-slate-400">
              {status.serviceName}: <span className="text-slate-300">{label}</span>
            </span>
          </div>
          <span className="text-xs text-slate-500">•</span>
          <UptimePercentage segments={status.segments} />
        </div>
        {hoveredSegment ? (
          <HoveredSegmentInfo segment={hoveredSegment} />
        ) : (
          <span className="text-xs text-slate-500">
            Last 7 days
          </span>
        )}
      </div>
    </footer>
  )
}

/**
 * Display uptime percentage
 * Only considers segments with known status (up or down), excludes unknown
 */
function UptimePercentage({ segments }: { segments: StatusSegment[] }) {
  // Only count segments with known status
  const knownSegments = segments.filter(s => s.status !== "unknown")
  const upCount = knownSegments.filter(s => s.status === "up").length
  const totalCount = knownSegments.length
  const percentage = totalCount > 0 ? (upCount / totalCount) * 100 : 0

  // Color based on uptime
  const colorClass = percentage >= 99
    ? "text-emerald-400"
    : percentage >= 95
    ? "text-emerald-300"
    : percentage >= 90
    ? "text-amber-400"
    : "text-red-400"

  return (
    <span className={`text-xs font-medium ${colorClass}`}>
      {percentage.toFixed(1)}% uptime
    </span>
  )
}

/**
 * Display info about the hovered segment
 */
function HoveredSegmentInfo({ segment }: { segment: StatusSegment }) {
  const date = new Date(segment.timestamp * 1000)
  const statusLabel = segment.status === "up" ? "Up" : segment.status === "down" ? "Down" : "Unknown"
  const statusColor = segment.status === "up" ? "text-emerald-400" : segment.status === "down" ? "text-red-400" : "text-slate-400"

  return (
    <span className="text-xs text-slate-400">
      {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      {' '}
      {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      {' - '}
      <span className={statusColor}>{statusLabel}</span>
    </span>
  )
}

/**
 * Individual status bar segment
 */
function StatusBar({
  segment,
  index,
  onHover,
}: {
  segment: StatusSegment
  index: number
  onHover: (segment: StatusSegment | null) => void
}) {
  const colorClass = getSegmentColor(segment.status)
  const hoverColorClass = getSegmentHoverColor(segment.status)

  return (
    <div
      className={`flex-1 ${colorClass} ${hoverColorClass} transition-colors duration-150 cursor-pointer`}
      style={{
        transitionDelay: `${index * 2}ms`,
      }}
      onMouseEnter={() => onHover(segment)}
      onMouseLeave={() => onHover(null)}
    />
  )
}

/**
 * Get the background color class for a segment based on status
 */
function getSegmentColor(status: StatusSegment["status"]): string {
  switch (status) {
    case "up":
      return "bg-emerald-500/80"
    case "down":
      return "bg-red-500/80"
    case "unknown":
    default:
      return "bg-slate-600/80"
  }
}

/**
 * Get the hover color class for a segment based on status
 */
function getSegmentHoverColor(status: StatusSegment["status"]): string {
  switch (status) {
    case "up":
      return "hover:bg-emerald-400"
    case "down":
      return "hover:bg-red-400"
    case "unknown":
    default:
      return "hover:bg-slate-500"
  }
}

/**
 * Get styling and label for overall status
 */
function getOverallStatusStyles(status: StatusData["overallStatus"]): { dotColor: string; label: string } {
  switch (status) {
    case "operational":
      return { dotColor: "bg-emerald-400", label: "Operational" }
    case "issues":
      return { dotColor: "bg-amber-400", label: "Having Issues" }
    case "down":
      return { dotColor: "bg-red-400", label: "Down" }
    case "unknown":
    default:
      return { dotColor: "bg-slate-400", label: "Unknown" }
  }
}
