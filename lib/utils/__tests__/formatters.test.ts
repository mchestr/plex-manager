import { formatFileSize, formatDate, getMediaTypeLabel, toEndOfDayExclusive } from '../formatters'

describe('formatters', () => {
  describe('formatFileSize', () => {
    it('should return "Unknown" for null input', () => {
      expect(formatFileSize(null)).toBe('Unknown')
    })

    it('should handle zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B')
    })

    it('should format bytes (< 1 KB)', () => {
      expect(formatFileSize(500)).toBe('500 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(10240)).toBe('10 KB')
    })

    it('should format megabytes', () => {
      const oneMB = 1024 ** 2
      expect(formatFileSize(oneMB)).toBe('1 MB')
      expect(formatFileSize(oneMB * 1.5)).toBe('1.5 MB')
      expect(formatFileSize(oneMB * 500)).toBe('500 MB')
    })

    it('should format gigabytes', () => {
      const oneGB = 1024 ** 3
      expect(formatFileSize(oneGB)).toBe('1 GB')
      expect(formatFileSize(oneGB * 2.5)).toBe('2.5 GB')
      expect(formatFileSize(oneGB * 10)).toBe('10 GB')
    })

    it('should format terabytes', () => {
      expect(formatFileSize(1099511627776)).toBe('1 TB') // 1024^4
      expect(formatFileSize(2199023255552)).toBe('2 TB')
    })

    it('should handle bigint input', () => {
      const oneGB = BigInt(1024 ** 3)
      expect(formatFileSize(oneGB)).toBe('1 GB')
      expect(formatFileSize(oneGB * BigInt(5))).toBe('5 GB')
      expect(formatFileSize(BigInt(0))).toBe('0 B')
    })

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1234567)).toBe('1.18 MB')
      expect(formatFileSize(1234567890)).toBe('1.15 GB')
    })

    it('should handle very large file sizes', () => {
      const largeSize = BigInt(1024) ** BigInt(3) * BigInt(1000) // 1000 GB
      expect(formatFileSize(largeSize)).toBe('1000 GB')
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
      expect(getMediaTypeLabel('UNKNOWN_TYPE')).toBe('Unknown Type')
      expect(getMediaTypeLabel('MUSIC_VIDEO')).toBe('Music Video')
      expect(getMediaTypeLabel('AUDIO_BOOK')).toBe('Audio Book')
      expect(getMediaTypeLabel('SOME_OTHER_TYPE')).toBe('Some Other Type')
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

    it('should preserve common acronyms in uppercase', () => {
      expect(getMediaTypeLabel('TV_SHOW')).toBe('TV Show')
      expect(getMediaTypeLabel('DVD_COLLECTION')).toBe('DVD Collection')
      expect(getMediaTypeLabel('HD_VIDEO')).toBe('HD Video')
      expect(getMediaTypeLabel('TV_SHOW_EPISODE')).toBe('TV Show Episode')
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
