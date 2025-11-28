import {
  formatWatchTime,
  formatWatchTimeHours,
  formatBytes,
} from "../time-formatting"

describe("time-formatting utilities", () => {
  describe("formatWatchTime", () => {
    it("should return '0 minutes' for 0 or falsy values", () => {
      expect(formatWatchTime(0)).toBe("0 minutes")
      expect(formatWatchTime(NaN)).toBe("0 minutes")
    })

    it("should format minutes only", () => {
      expect(formatWatchTime(1)).toBe("1 minute")
      expect(formatWatchTime(30)).toBe("30 minutes")
      expect(formatWatchTime(59)).toBe("59 minutes")
    })

    it("should format hours and minutes", () => {
      expect(formatWatchTime(60)).toBe("1 hour")
      expect(formatWatchTime(61)).toBe("1 hour, 1 minute")
      expect(formatWatchTime(125)).toBe("2 hours, 5 minutes")
      expect(formatWatchTime(120)).toBe("2 hours")
    })

    it("should format days, hours, and minutes", () => {
      expect(formatWatchTime(1440)).toBe("1 day") // 24 hours
      expect(formatWatchTime(1441)).toBe("1 day, 1 minute")
      expect(formatWatchTime(1500)).toBe("1 day, 1 hour")
      expect(formatWatchTime(1501)).toBe("1 day, 1 hour, 1 minute")
      expect(formatWatchTime(3000)).toBe("2 days, 2 hours")
      expect(formatWatchTime(2880)).toBe("2 days") // 48 hours
    })

    it("should handle large values", () => {
      // 7 days
      expect(formatWatchTime(10080)).toBe("7 days")
      // 30 days
      expect(formatWatchTime(43200)).toBe("30 days")
    })

    it("should use proper singular/plural forms", () => {
      expect(formatWatchTime(1)).toBe("1 minute")
      expect(formatWatchTime(2)).toBe("2 minutes")
      expect(formatWatchTime(60)).toBe("1 hour")
      expect(formatWatchTime(120)).toBe("2 hours")
      expect(formatWatchTime(1440)).toBe("1 day")
      expect(formatWatchTime(2880)).toBe("2 days")
    })

    it("should handle decimal minutes by flooring", () => {
      expect(formatWatchTime(1.5)).toBe("1 minute")
      expect(formatWatchTime(1.9)).toBe("1 minute")
      expect(formatWatchTime(60.5)).toBe("1 hour")
    })
  })

  describe("formatWatchTimeHours", () => {
    it("should format as hours for small values", () => {
      expect(formatWatchTimeHours(60)).toBe("1 hour")
      expect(formatWatchTimeHours(120)).toBe("2 hours")
      expect(formatWatchTimeHours(1000)).toBe("16 hours")
    })

    it("should format as days when >= 24 hours", () => {
      expect(formatWatchTimeHours(1440)).toBe("1 day")
      expect(formatWatchTimeHours(1500)).toBe("1 day")
      expect(formatWatchTimeHours(2880)).toBe("2 days")
      expect(formatWatchTimeHours(3000)).toBe("2 days")
    })

    it("should use proper singular/plural forms", () => {
      expect(formatWatchTimeHours(60)).toBe("1 hour")
      expect(formatWatchTimeHours(120)).toBe("2 hours")
      expect(formatWatchTimeHours(1440)).toBe("1 day")
      expect(formatWatchTimeHours(2880)).toBe("2 days")
    })

    it("should use locale string formatting for large numbers", () => {
      // 1000 days = 1,440,000 minutes
      const result = formatWatchTimeHours(1440000)
      expect(result).toBe("1,000 days")
    })

    it("should handle 0 minutes", () => {
      expect(formatWatchTimeHours(0)).toBe("0 hours")
    })
  })

  describe("formatBytes", () => {
    it("should return 'Unknown' for null", () => {
      expect(formatBytes(null)).toBe("Unknown")
    })

    it("should return '0 Bytes' for 0", () => {
      expect(formatBytes(0)).toBe("0 Bytes")
    })

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500 Bytes")
    })

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1 KB")
      expect(formatBytes(1536)).toBe("1.5 KB")
    })

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1 MB")
      expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB")
    })

    it("should format gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB")
      expect(formatBytes(1024 * 1024 * 1024 * 1.5)).toBe("1.5 GB")
    })

    it("should format terabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB")
    })

    it("should format petabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024 * 1024)).toBe("1 PB")
    })

    it("should handle bigint values", () => {
      expect(formatBytes(BigInt(1024))).toBe("1 KB")
      expect(formatBytes(BigInt(1024 * 1024))).toBe("1 MB")
      expect(formatBytes(BigInt(1024 * 1024 * 1024))).toBe("1 GB")
    })

    it("should limit decimal places to 2", () => {
      expect(formatBytes(1024 * 1.333)).toBe("1.33 KB")
      expect(formatBytes(1024 * 1.337)).toBe("1.34 KB")
    })
  })
})
