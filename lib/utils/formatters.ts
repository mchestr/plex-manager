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
 * ## Timezone Considerations
 *
 * **This function assumes UTC dates.** Date strings without timezone info (e.g., "2025-01-15")
 * are parsed as UTC midnight by JavaScript's Date constructor. This works correctly when:
 * - Database timestamps are stored in UTC (Prisma's default behavior)
 * - Date strings come from HTML date inputs (which provide YYYY-MM-DD format)
 *
 * **Future timezone support:** If local timezone handling is needed, this function would
 * need to accept an optional timezone parameter and use a library like `date-fns-tz` to
 * calculate the correct end-of-day boundary in the user's timezone.
 *
 * @param dateStr - Date string (e.g., "2025-01-15") or undefined
 * @returns Date object representing start of next day in UTC, or undefined if input is undefined
 *
 * @example
 * // For inclusive date range queries, use with `lt`:
 * const endDateNextDay = toEndOfDayExclusive(params.endDate)
 * prisma.model.findMany({ where: { createdAt: { gte: startDate, lt: endDateNextDay } } })
 *
 * @example
 * // Input: "2025-01-15" (parsed as 2025-01-15T00:00:00.000Z)
 * // Output: 2025-01-16T00:00:00.000Z
 * // Records from 2025-01-15T23:59:59.999Z are included (< 2025-01-16T00:00:00.000Z)
 * // Records from 2025-01-16T00:00:00.001Z are excluded
 */
export function toEndOfDayExclusive(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  return new Date(new Date(dateStr).getTime() + MILLISECONDS_PER_DAY)
}
