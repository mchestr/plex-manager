/**
 * Formatting utilities for consistent data display across the application
 */

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
  return mediaType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
