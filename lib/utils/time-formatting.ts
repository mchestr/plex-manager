/**
 * Time and size formatting utilities
 * Centralized implementations to avoid duplication across the codebase
 */

/**
 * Formats duration in minutes to human-readable string with full words
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2 days, 5 hours, 30 minutes" or "45 minutes"
 *
 * @example
 * formatWatchTime(0) // "0 minutes"
 * formatWatchTime(45) // "45 minutes"
 * formatWatchTime(125) // "2 hours, 5 minutes"
 * formatWatchTime(1500) // "1 day, 1 hour"
 * formatWatchTime(3000) // "2 days, 2 hours"
 */
export function formatWatchTime(minutes: number): string {
  if (!minutes || minutes === 0) return "0 minutes"

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = Math.floor(minutes % 60)

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`)
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`)
  }

  return parts.join(", ")
}

/**
 * Formats duration in minutes to a compact format (days or hours only)
 * Useful for displaying in constrained spaces like summary cards
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2 days" or "16 hours"
 *
 * @example
 * formatWatchTimeHours(60) // "1 hour"
 * formatWatchTimeHours(1000) // "16 hours"
 * formatWatchTimeHours(1500) // "1 day"
 * formatWatchTimeHours(3000) // "2 days"
 */
export function formatWatchTimeHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days.toLocaleString()} ${days === 1 ? "day" : "days"}`
  }
  return `${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`
}

/**
 * Formats bytes to human-readable file size
 * @param bytes - Size in bytes (bigint, number, or null)
 * @returns Formatted string like "1.5 GB" or "256 MB"
 *
 * @example
 * formatBytes(0) // "0 Bytes"
 * formatBytes(1024) // "1 KB"
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(1073741824) // "1 GB"
 */
export function formatBytes(bytes: bigint | number | null): string {
  if (bytes === null) return "Unknown"

  const numBytes = typeof bytes === "bigint" ? Number(bytes) : bytes
  if (numBytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.floor(Math.log(numBytes) / Math.log(k))

  return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Formats a date as a relative time string (e.g., "2 hours ago", "in 5 minutes")
 * @param date - Date to format (Date object or ISO string)
 * @param options - Options for formatting
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 60000)) // "1 minute ago"
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() + 3600000)) // "in 1 hour"
 */
export function formatRelativeTime(
  date: Date | string,
  options: { addSuffix?: boolean } = { addSuffix: true }
): string {
  const targetDate = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = targetDate.getTime() - now.getTime()
  const isFuture = diffMs > 0
  const absDiffMs = Math.abs(diffMs)

  const seconds = Math.floor(absDiffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  let value: number
  let unit: string

  if (years >= 1) {
    value = years
    unit = years === 1 ? "year" : "years"
  } else if (months >= 1) {
    value = months
    unit = months === 1 ? "month" : "months"
  } else if (days >= 1) {
    value = days
    unit = days === 1 ? "day" : "days"
  } else if (hours >= 1) {
    value = hours
    unit = hours === 1 ? "hour" : "hours"
  } else if (minutes >= 1) {
    value = minutes
    unit = minutes === 1 ? "minute" : "minutes"
  } else {
    value = seconds
    unit = seconds === 1 ? "second" : "seconds"
  }

  const timeStr = `${value} ${unit}`

  if (!options.addSuffix) {
    return timeStr
  }

  return isFuture ? `in ${timeStr}` : `${timeStr} ago`
}
