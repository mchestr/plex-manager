/**
 * The formatter module (P3.10). `npm run test:tz` reruns this file under
 * TZ=Pacific/Kiritimati (UTC+14): every answer must be the same, because
 * nothing here may read the process zone.
 */

import {
  bindFormat,
  calendarMonthsBetween,
  formatApproxDuration,
  formatBytes,
  formatCompact,
  formatDate,
  formatDateTime,
  formatDayKey,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatResolution,
  formatTime,
  formatTokens,
  toEndOfDayExclusive,
} from "@/lib/utils/format"

const ZONES = ["UTC", "America/Los_Angeles", "Europe/Berlin", "Australia/Sydney"] as const
const LOCALES = ["en-US", "en-GB", "de-DE"] as const

// 23:30 UTC on 31 December: still 2026 in UTC and Los Angeles, already 2027 east of Greenwich.
const NEW_YEARS_EVE = Date.parse("2026-12-31T23:30:00Z")

const SHORT_DATES: Record<(typeof ZONES)[number], Record<(typeof LOCALES)[number], string>> = {
  UTC: { "en-US": "Dec 31, 2026", "en-GB": "31 Dec 2026", "de-DE": "31. Dez. 2026" },
  "America/Los_Angeles": { "en-US": "Dec 31, 2026", "en-GB": "31 Dec 2026", "de-DE": "31. Dez. 2026" },
  "Europe/Berlin": { "en-US": "Jan 1, 2027", "en-GB": "1 Jan 2027", "de-DE": "1. Jan. 2027" },
  "Australia/Sydney": { "en-US": "Jan 1, 2027", "en-GB": "1 Jan 2027", "de-DE": "1. Jan. 2027" },
}

const NUMBERS: Record<(typeof LOCALES)[number], { number: string; table: string; dollars: string; percent: string }> = {
  "en-US": { number: "21,338.5", table: "$0.087", dollars: "$1,234.50", percent: "12.5%" },
  "en-GB": { number: "21,338.5", table: "US$0.087", dollars: "US$1,234.50", percent: "12.5%" },
  "de-DE": { number: "21.338,5", table: "0,087 $", dollars: "1.234,50 $", percent: "12,5 %" },
}

describe.each(ZONES)("in %s", (timeZone) => {
  it.each(LOCALES)("formats 23:30 on 31 December in %s on the zone's calendar day", (locale) => {
    expect(formatDate(NEW_YEARS_EVE, "short", { timeZone, locale })).toBe(SHORT_DATES[timeZone][locale])
  })

  it.each(LOCALES)("formats numbers and money in %s the same in every zone", (locale) => {
    const settings = { timeZone, locale }
    expect(formatNumber(21338.5, settings)).toBe(NUMBERS[locale].number)
    expect(formatMoney(0.0874, "table", settings)).toBe(NUMBERS[locale].table)
    expect(formatMoney(1234.5, "table", settings)).toBe(NUMBERS[locale].dollars)
    expect(formatPercent(0.125, settings)).toBe(NUMBERS[locale].percent)
  })

  it("reads a day key from its parts, never shifting it a day", () => {
    expect(formatDayKey("2026-10-17", "short", { locale: "en-US" })).toBe("Oct 17, 2026")
    expect(bindFormat({ timeZone, locale: "en-GB" }).dayKey("2026-12-01", "day-month")).toBe("1 December")
  })
})

describe("dates and times", () => {
  const la = { timeZone: "America/Los_Angeles", locale: "en-US" }

  it("formats the date styles", () => {
    expect(formatDate(NEW_YEARS_EVE, "long", la)).toBe("December 31, 2026")
    expect(formatDate(NEW_YEARS_EVE, "day-month", la)).toBe("December 31")
    expect(formatDate(NEW_YEARS_EVE, "day-month", { timeZone: "UTC", locale: "en-GB" })).toBe("31 December")
    expect(formatDate(NEW_YEARS_EVE, "day-month-short", la)).toBe("Dec 31")
  })

  it("adds the zone to admin timestamps on request", () => {
    expect(formatDateTime(NEW_YEARS_EVE, la)).toBe("Dec 31, 2026, 3:30 PM")
    expect(formatDateTime(NEW_YEARS_EVE, la, { zoneLabel: true })).toBe("Dec 31, 2026, 3:30 PM PST")
    expect(formatTime(NEW_YEARS_EVE, { timeZone: "Europe/Berlin", locale: "de-DE" })).toBe("0:30")
  })

  it("labels Chicago times CDT in October and CST in January (P10.6)", () => {
    const chicago = { timeZone: "America/Chicago", locale: "en-US" }
    expect(formatDateTime("2026-10-12T19:26:00Z", chicago, { zoneLabel: true })).toBe("Oct 12, 2026, 2:26 PM CDT")
    expect(formatDateTime("2027-01-12T20:26:00Z", chicago, { zoneLabel: true })).toBe("Jan 12, 2027, 2:26 PM CST")
  })

  it.each([
    // US spring change on 8 March 2026: 02:00 PST jumps to 03:00 PDT.
    ["2026-03-08T09:30:00Z", "Mar 8, 2026, 1:30 AM PST"],
    ["2026-03-08T10:30:00Z", "Mar 8, 2026, 3:30 AM PDT"],
    // US autumn change on 1 November 2026: 01:30 happens twice.
    ["2026-11-01T08:30:00Z", "Nov 1, 2026, 1:30 AM PDT"],
    ["2026-11-01T09:30:00Z", "Nov 1, 2026, 1:30 AM PST"],
  ])("follows the Los Angeles DST change at %s", (instant, expected) => {
    expect(formatDateTime(instant, la, { zoneLabel: true })).toBe(expected)
  })

  it.each([
    // EU spring change on 29 March 2026 and autumn change on 25 October 2026.
    ["2026-03-29T00:30:00Z", "29. März 2026, 01:30 MEZ"],
    ["2026-03-29T01:30:00Z", "29. März 2026, 03:30 MESZ"],
    ["2026-10-25T00:30:00Z", "25. Okt. 2026, 02:30 MESZ"],
    ["2026-10-25T01:30:00Z", "25. Okt. 2026, 02:30 MEZ"],
  ])("follows the Berlin DST change at %s", (instant, expected) => {
    expect(formatDateTime(instant, { timeZone: "Europe/Berlin", locale: "de-DE" }, { zoneLabel: true })).toBe(expected)
  })
})

describe("formatRelative", () => {
  const berlin = { timeZone: "Europe/Berlin", locale: "en-US" }

  it("says yesterday for 20:00 yesterday at 18:00 today, by calendar day in the zone", () => {
    // 20:00 and 18:00 Berlin summer time are 18:00 and 16:00 UTC.
    expect(formatRelative("2026-10-18T18:00:00Z", { ...berlin, now: "2026-10-19T16:00:00Z" })).toBe("yesterday")
    expect(formatRelative("2026-10-18T18:00:00Z", { ...berlin, locale: "de-DE", now: "2026-10-19T16:00:00Z" })).toBe("gestern")
  })

  it("counts calendar months, not 30-day blocks", () => {
    // 360 days back: 12 blocks of 30 days, but only 11 calendar months.
    expect(formatRelative("2025-10-24T12:00:00Z", { ...berlin, now: "2026-10-19T12:00:00Z" })).toBe("11 months ago")
    expect(formatRelative("2024-10-19T14:30:00Z", { ...berlin, now: "2026-10-19T12:00:00Z" })).toBe("2 years ago")
  })

  it("uses elapsed time within the day, past and future", () => {
    const now = "2026-10-19T12:00:00Z"
    expect(formatRelative("2026-10-19T11:59:55Z", { ...berlin, now })).toBe("now")
    expect(formatRelative("2026-10-19T11:59:30Z", { ...berlin, now })).toBe("30 seconds ago")
    expect(formatRelative("2026-10-19T11:55:00Z", { ...berlin, now })).toBe("5 minutes ago")
    expect(formatRelative("2026-10-19T14:30:00Z", { ...berlin, now })).toBe("in 2 hours")
    expect(formatRelative("2026-10-22T12:00:00Z", { ...berlin, now })).toBe("in 3 days")
  })
})

describe("calendarMonthsBetween", () => {
  it("counts whole calendar months in the zone", () => {
    expect(calendarMonthsBetween("2026-04-30T12:00:00Z", "2026-10-30T12:00:00Z", "UTC")).toBe(6)
    expect(calendarMonthsBetween("2026-04-30T12:00:00Z", "2026-10-29T12:00:00Z", "UTC")).toBe(5)
    expect(calendarMonthsBetween("2026-10-30T12:00:00Z", "2026-04-30T12:00:00Z", "UTC")).toBe(-6)
  })

  it("reads the day in the zone, not in UTC", () => {
    // 05:00 UTC on 15 July is still 14 July in Los Angeles.
    expect(calendarMonthsBetween("2026-01-15T10:00:00Z", "2026-07-15T05:00:00Z", "UTC")).toBe(6)
    expect(calendarMonthsBetween("2026-01-15T10:00:00Z", "2026-07-15T05:00:00Z", "America/Los_Angeles")).toBe(5)
  })
})

describe("money", () => {
  const us = { locale: "en-US" }

  it("uses 2 decimals at $1 and above in both modes", () => {
    expect(formatMoney(12, "table", us)).toBe("$12.00")
    expect(formatMoney(1.005, "prose", us)).toBe("$1.01")
    expect(formatMoney(0, "table", us)).toBe("$0.00")
  })

  it("uses 3 decimals below $1 in tables and 2 significant digits in prose", () => {
    expect(formatMoney(0.0874, "table", us)).toBe("$0.087")
    expect(formatMoney(0.000123, "table", us)).toBe("$0.000")
    expect(formatMoney(0.000123, "prose", us)).toBe("$0.00012")
    expect(formatMoney(0.5, "prose", us)).toBe("$0.50")
  })

  it("formats tokens and compact numbers", () => {
    expect(formatTokens(21338, us)).toBe("21,338 tokens")
    expect(formatTokens(1, us)).toBe("1 token")
    expect(formatCompact(12345, us)).toBe("12.3K")
  })
})

describe("formatDuration", () => {
  it("floors every unit", () => {
    expect(formatDuration(119.9, "short")).toBe("1 h 59 m")
    expect(formatDuration(1570, "short")).toBe("26 h 10 m")
    expect(formatDuration(1570, "long")).toBe("26 hours, 10 minutes")
    expect(formatDuration(0, "short")).toBe("0 m")
  })

  it("goes down to seconds for job runs", () => {
    expect(formatDuration(1.5, "short", { smallestUnit: "second" })).toBe("1 m 30 s")
    expect(formatDuration(2.4 / 60, "short", { smallestUnit: "second" })).toBe("2 s")
    expect(formatDuration(0.2 / 60, "short", { smallestUnit: "second" })).toBe("0 s")
    expect(formatDuration(0.5, "short")).toBe("0 m")
  })

  it("groups large values in the given locale", () => {
    expect(formatDuration(1440000, "short", { largestUnit: "day", locale: "de-DE" })).toBe("1.000 d")
  })

  it("rounds approximate durations to whole minutes", () => {
    expect(formatApproxDuration(4.4)).toBe("About 4 minutes")
    expect(formatApproxDuration(0.2)).toBe("About 1 minute")
  })

  // The v2 tables from the deleted time-formatting.test.ts: identical strings.
  describe("v2 formatWatchTime: long, largest unit day", () => {
    const watchTime = (m: number) => formatDuration(m, "long", { largestUnit: "day" })

    it.each([
      [0, "0 minutes"],
      [NaN, "0 minutes"],
      [1, "1 minute"],
      [30, "30 minutes"],
      [59, "59 minutes"],
      [60, "1 hour"],
      [61, "1 hour, 1 minute"],
      [120, "2 hours"],
      [125, "2 hours, 5 minutes"],
      [1440, "1 day"],
      [1441, "1 day, 1 minute"],
      [1500, "1 day, 1 hour"],
      [1501, "1 day, 1 hour, 1 minute"],
      [2880, "2 days"],
      [3000, "2 days, 2 hours"],
      [10080, "7 days"],
      [43200, "30 days"],
      [1.5, "1 minute"],
      [1.9, "1 minute"],
      [60.5, "1 hour"],
    ])("%p minutes is %p", (minutes, expected) => {
      expect(watchTime(minutes)).toBe(expected)
    })
  })

  describe("v2 formatWatchTimeHours: long, day to hour, one unit", () => {
    const watchTimeHours = (m: number) =>
      formatDuration(m, "long", { largestUnit: "day", smallestUnit: "hour", maxUnits: 1 })

    it.each([
      [0, "0 hours"],
      [60, "1 hour"],
      [120, "2 hours"],
      [1000, "16 hours"],
      [1440, "1 day"],
      [1500, "1 day"],
      [2880, "2 days"],
      [3000, "2 days"],
      [1440000, "1,000 days"],
    ])("%p minutes is %p", (minutes, expected) => {
      expect(watchTimeHours(minutes)).toBe(expected)
    })
  })
})

describe("formatBytes", () => {
  it.each([
    [null, "Unknown"],
    [0, "0 Bytes"],
    [500, "500 Bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1024 * 1.333, "1.33 KB"],
    [1024 * 1.337, "1.34 KB"],
    [1024 ** 2 * 1.5, "1.5 MB"],
    [1024 ** 3 * 1.5, "1.5 GB"],
    [1024 ** 4, "1 TB"],
    [1024 ** 5, "1 PB"],
    [BigInt(1024 ** 3), "1 GB"],
  ])("%p bytes is %p", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe("formatResolution", () => {
  it.each([
    ["1080", "1080p"],
    [720, "720p"],
    [" 480 ", "480p"],
    ["4k", "4K"],
    ["sd", "sd"],
  ])("%p is %p", (value, expected) => {
    expect(formatResolution(value)).toBe(expected)
  })
})

describe("toEndOfDayExclusive", () => {
  it("returns undefined without a date", () => {
    expect(toEndOfDayExclusive(undefined)).toBeUndefined()
  })

  it("returns the next UTC midnight, so `lt` includes the whole end date", () => {
    const end = toEndOfDayExclusive("2025-01-15")!
    expect(end.toISOString()).toBe("2025-01-16T00:00:00.000Z")
    expect(toEndOfDayExclusive("2024-12-31")!.toISOString()).toBe("2025-01-01T00:00:00.000Z")
    expect(new Date("2025-01-15T23:59:59.999Z") < end).toBe(true)
    expect(new Date("2025-01-16T00:00:00.001Z") < end).toBe(false)
  })
})

describe("bindFormat", () => {
  it("binds every formatter to one zone and locale", () => {
    const f = bindFormat({ timeZone: "Europe/Berlin", locale: "de-DE" })
    expect(f.number(1234)).toBe("1.234")
    expect(f.money(0.0874)).toBe("0,087 $")
    expect(f.tokens(2)).toBe("2 tokens")
    expect(f.date(NEW_YEARS_EVE)).toBe("1. Jan. 2027")
    expect(f.time(NEW_YEARS_EVE)).toBe("0:30")
    expect(f.dateTime(NEW_YEARS_EVE)).toBe("1. Jan. 2027, 0:30")
    expect(f.relative("2026-10-18T18:00:00Z", "2026-10-19T16:00:00Z")).toBe("gestern")
    expect(f.percent(0.5, 0)).toBe("50 %")
    expect(f.duration(1570, "short")).toBe("26 h 10 m")
  })
})
