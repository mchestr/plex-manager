import { formatFileSize, formatDate, getMediaTypeLabel } from '@/lib/utils/formatters'

describe('formatFileSize', () => {
  it('should return "Unknown" for null input', () => {
    expect(formatFileSize(null)).toBe('Unknown')
  })

  it('should format zero bytes', () => {
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
    expect(formatFileSize(1048576)).toBe('1 MB') // 1024^2
    expect(formatFileSize(5242880)).toBe('5 MB')
    expect(formatFileSize(1572864)).toBe('1.5 MB')
  })

  it('should format gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB') // 1024^3
    expect(formatFileSize(5368709120)).toBe('5 GB')
    expect(formatFileSize(1610612736)).toBe('1.5 GB')
  })

  it('should format terabytes', () => {
    expect(formatFileSize(1099511627776)).toBe('1 TB') // 1024^4
    expect(formatFileSize(2199023255552)).toBe('2 TB')
  })

  it('should handle bigint input', () => {
    expect(formatFileSize(BigInt(1073741824))).toBe('1 GB')
    expect(formatFileSize(BigInt(5368709120))).toBe('5 GB')
    expect(formatFileSize(BigInt(0))).toBe('0 B')
  })

  it('should round to 2 decimal places', () => {
    expect(formatFileSize(1234567)).toBe('1.18 MB')
    expect(formatFileSize(1234567890)).toBe('1.15 GB')
  })
})

describe('formatDate', () => {
  it('should return "Never" for null input', () => {
    expect(formatDate(null)).toBe('Never')
  })

  it('should format valid date to locale string', () => {
    const date = new Date('2024-01-15T12:00:00Z')
    const result = formatDate(date)

    // Result will vary by locale, but should contain the date components
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result).not.toBe('Never')
  })

  it('should handle Date objects correctly', () => {
    const now = new Date()
    const result = formatDate(now)

    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result).not.toBe('Never')
  })

  it('should create new Date instance from input', () => {
    // This tests that the function creates a new Date from the input
    const date = new Date('2023-06-15T08:30:00Z')
    const result = formatDate(date)

    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })
})

describe('getMediaTypeLabel', () => {
  it('should return "Movie" for MOVIE type', () => {
    expect(getMediaTypeLabel('MOVIE')).toBe('Movie')
  })

  it('should return "TV Series" for TV_SERIES type', () => {
    expect(getMediaTypeLabel('TV_SERIES')).toBe('TV Series')
  })

  it('should return "Episode" for EPISODE type', () => {
    expect(getMediaTypeLabel('EPISODE')).toBe('Episode')
  })

  it('should convert unknown types to title case with underscores replaced by spaces', () => {
    expect(getMediaTypeLabel('UNKNOWN_TYPE')).toBe('Unknown Type')
    expect(getMediaTypeLabel('MUSIC_VIDEO')).toBe('Music Video')
    expect(getMediaTypeLabel('SOME_OTHER_TYPE')).toBe('Some Other Type')
  })

  it('should convert unknown types to title case even without underscores', () => {
    expect(getMediaTypeLabel('CUSTOM')).toBe('Custom')
    expect(getMediaTypeLabel('OTHER')).toBe('Other')
  })

  it('should handle multiple underscores and convert to title case', () => {
    expect(getMediaTypeLabel('VERY_LONG_TYPE_NAME')).toBe('Very Long Type Name')
  })
})
