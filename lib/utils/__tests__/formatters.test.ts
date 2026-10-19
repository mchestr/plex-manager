import { toEndOfDayExclusive } from '../formatters'

describe('formatters', () => {
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
