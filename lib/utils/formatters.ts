/**
 * Formatting utilities for consistent data display across the application
 */

/** Number of milliseconds in one day */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Convert a date string to the start of the next day for inclusive date range queries.
 *
 * When filtering by date range, end dates parsed as strings (e.g., "2025-01-15") become
 * midnight UTC. Using `lte` (less than or equal) excludes records created after midnight.
 * This function converts the end date to the start of the next day so `lt` (less than)
 * can be used to include all records from the entire end date.
 *
 * @param dateStr - Date string (e.g., "2025-01-15") or undefined
 * @returns Date object representing start of next day, or undefined if input is undefined
 *
 * @example
 * // For inclusive date range queries, use with `lt`:
 * const endDateNextDay = toEndOfDayExclusive(params.endDate)
 * prisma.model.findMany({ where: { createdAt: { gte: startDate, lt: endDateNextDay } } })
 */
export function toEndOfDayExclusive(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  return new Date(new Date(dateStr).getTime() + MILLISECONDS_PER_DAY)
}

/**
 * Format bytes to human-readable file size
 * @param bytes - File size in bytes (bigint, number, or null)
 * @returns Formatted file size string (e.g., "1.23 GB", "456.78 MB")
 */
export function formatFileSize(bytes: bigint | number | null): string {
  if (bytes === null) return 'Unknown'

  const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes
  if (numBytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(numBytes) / Math.log(k))

  return `${parseFloat((numBytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Format date to localized date string
 * @param date - Date object or null
 * @returns Formatted date string (e.g., "1/15/2024") or "Never" if null
 */
export function formatDate(date: Date | null): string {
  if (!date) return 'Never'
  return date.toLocaleDateString()
}

/** Common acronyms that should remain uppercase when converting to title case */
const COMMON_ACRONYMS = new Set(['TV', 'DVD', 'HD', 'SD', 'UHD', 'HDR', 'CD', 'VR', 'AR', 'AI'])

/**
 * Convert a string to title case while preserving common acronyms
 * @param str - String to convert (e.g., 'TV SHOW', 'HD VIDEO')
 * @returns Title case string with acronyms preserved (e.g., 'TV Show', 'HD Video')
 */
function toTitleCaseWithAcronyms(str: string): string {
  return str
    .split(' ')
    .map((word) => {
      const upperWord = word.toUpperCase()
      if (COMMON_ACRONYMS.has(upperWord)) {
        return upperWord
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Get human-readable label for media type
 * @param mediaType - Media type enum value (e.g., 'MOVIE', 'TV_SERIES', 'EPISODE')
 * @returns Human-readable label
 */
export function getMediaTypeLabel(mediaType: string): string {
  const labels: Record<string, string> = {
    'MOVIE': 'Movie',
    'TV_SERIES': 'TV Series',
    'EPISODE': 'Episode',
  }

  if (labels[mediaType]) return labels[mediaType]

  // Fallback: convert to title case for consistency with known types
  const spaced = mediaType.replace(/_/g, ' ')
  return toTitleCaseWithAcronyms(spaced)
}
