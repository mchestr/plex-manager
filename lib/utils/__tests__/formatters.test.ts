import { formatFileSize, formatDate, getMediaTypeLabel, toEndOfDayExclusive } from '../formatters'

describe('formatters', () => {
  describe('formatFileSize', () => {
    it('should return "Unknown" for null input', () => {
      expect(formatFileSize(null)).toBe('Unknown')
    })

    it('should format bytes to GB when >= 1 GB', () => {
      const oneGB = 1024 ** 3
      expect(formatFileSize(oneGB)).toBe('1 GB')
      expect(formatFileSize(oneGB * 2.5)).toBe('2.5 GB')
      expect(formatFileSize(oneGB * 10)).toBe('10 GB')
    })

    it('should format bytes to MB when < 1 GB', () => {
      const oneMB = 1024 ** 2
      expect(formatFileSize(oneMB)).toBe('1 MB')
      expect(formatFileSize(oneMB * 500)).toBe('500 MB')
      expect(formatFileSize(oneMB * 1.5)).toBe('1.5 MB')
    })

    it('should handle bigint input', () => {
      const oneGB = BigInt(1024 ** 3)
      expect(formatFileSize(oneGB)).toBe('1 GB')
      expect(formatFileSize(oneGB * BigInt(5))).toBe('5 GB')
    })

    it('should handle number input', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB') // 1 GB in bytes
      expect(formatFileSize(1048576)).toBe('1 MB') // 1 MB in bytes
    })

    it('should round to 2 decimal places', () => {
      const bytes = 1536 * 1024 * 1024 // 1.5 GB
      expect(formatFileSize(bytes)).toBe('1.5 GB')
    })

    it('should handle very large file sizes', () => {
      const largeSize = BigInt(1024) ** BigInt(3) * BigInt(1000) // 1000 GB
      expect(formatFileSize(largeSize)).toBe('1000 GB')
    })

    it('should handle zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })
  })

  describe('formatDate', () => {
    it('should return "Never" for null input', () => {
      expect(formatDate(null)).toBe('Never')
    })

    it('should format valid Date object', () => {
      const testDate = new Date('2024-01-15T12:00:00Z')
      const result = formatDate(testDate)

      // Check that it returns a localized date string (format may vary by locale)
      expect(result).toBeTruthy()
      expect(result).not.toBe('Never')
      expect(result).not.toBe('Unknown')
    })

    it('should handle different dates consistently', () => {
      const date1 = new Date('2023-12-25T00:00:00Z')
      const date2 = new Date('2024-06-01T00:00:00Z')

      expect(formatDate(date1)).toBeTruthy()
      expect(formatDate(date2)).toBeTruthy()
      expect(formatDate(date1)).not.toBe(formatDate(date2))
    })

    it('should handle dates passed as Date objects', () => {
      const now = new Date()
      const result = formatDate(now)

      expect(result).toBeTruthy()
      expect(result).not.toBe('Never')
    })
  })

  describe('getMediaTypeLabel', () => {
    it('should return title case labels for known media types', () => {
      expect(getMediaTypeLabel('MOVIE')).toBe('Movie')
      expect(getMediaTypeLabel('TV_SERIES')).toBe('TV Series')
      expect(getMediaTypeLabel('EPISODE')).toBe('Episode')
    })

    it('should convert unknown media types to title case', () => {
      expect(getMediaTypeLabel('TV_SHOW')).toBe('Tv Show')
      expect(getMediaTypeLabel('AUDIO_BOOK')).toBe('Audio Book')
      expect(getMediaTypeLabel('TV_SHOW_EPISODE')).toBe('Tv Show Episode')
    })

    it('should handle empty string', () => {
      expect(getMediaTypeLabel('')).toBe('')
    })

    it('should convert strings without underscores to title case', () => {
      expect(getMediaTypeLabel('CUSTOM')).toBe('Custom')
      expect(getMediaTypeLabel('OTHER')).toBe('Other')
    })

    it('should handle multiple underscores and convert to title case', () => {
      expect(getMediaTypeLabel('VERY_LONG_TYPE_NAME')).toBe('Very Long Type Name')
    })
  })

  describe('toEndOfDayExclusive', () => {
    it('should return undefined for undefined input', () => {
      expect(toEndOfDayExclusive(undefined)).toBeUndefined()
    })

    it('should add 24 hours to a date string', () => {
      const result = toEndOfDayExclusive('2025-01-15')
      expect(result).toBeInstanceOf(Date)
      // 2025-01-15 at midnight UTC + 24 hours = 2025-01-16 at midnight UTC
      expect(result!.toISOString()).toBe('2025-01-16T00:00:00.000Z')
    })

    it('should handle different date formats', () => {
      const result = toEndOfDayExclusive('2024-12-31')
      expect(result!.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    })

    it('should work for inclusive date range queries', () => {
      // This demonstrates the intended use case:
      // If user selects end date "2025-01-15", records created at any time
      // on 2025-01-15 should be included. By converting to 2025-01-16T00:00:00
      // and using `lt` (less than), all records from 2025-01-15 are captured.
      const endDate = toEndOfDayExclusive('2025-01-15')
      const recordCreatedLateOnEndDate = new Date('2025-01-15T23:59:59.999Z')
      const recordCreatedNextDay = new Date('2025-01-16T00:00:00.001Z')

      // Record from end date should be included (less than next day start)
      expect(recordCreatedLateOnEndDate < endDate!).toBe(true)
      // Record from next day should be excluded
      expect(recordCreatedNextDay < endDate!).toBe(false)
    })
  })
})
