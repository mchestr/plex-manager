import {
  formatCount,
  formatDayMonth,
  formatHero,
  formatHour,
  formatRewindDuration,
  formatRunningTime,
  formatShare,
  pluralWord,
} from "@/lib/rewind/format"

const US = { locale: "en-US" }
const GB = { locale: "en-GB" }
const NBSP = "\u00A0"

describe("lib/rewind/format", () => {
  it("matches the module's @example", () => {
    expect(formatHero(12480, US)).toBe("12,480")
    expect(formatCount(1, { one: "film", other: "films" }, GB)).toBe(`1${NBSP}film`)
    expect(formatRewindDuration(1570, US)).toBe(`26${NBSP}h 10${NBSP}m`)
    expect(formatRewindDuration(7, US)).toBe(`7${NBSP}minutes`)
    expect(formatShare(0.004, US)).toBe("under 1%")
    expect(formatHour(22, US)).toBe(`10${NBSP}PM`)
    expect(formatDayMonth("2026-07-04", GB)).toBe(`4${NBSP}July`)
  })

  it("never abbreviates a hero number", () => {
    expect(formatHero(12480, US)).toBe("12,480")
    expect(formatHero(1307, GB)).toBe("1,307")
    expect(formatHero(1_250_000, US)).toBe("1,250,000")
  })

  it.each([US, GB])("pluralises through Intl.PluralRules in %j", (settings) => {
    const films = { one: "film", other: "films" }
    expect(formatCount(1, films, settings)).toBe(`1${NBSP}film`)
    expect(formatCount(0, films, settings)).toBe(`0${NBSP}films`)
    expect(formatCount(2, films, settings)).toBe(`2${NBSP}films`)
    expect(formatCount(12480, films, settings)).toBe(`12,480${NBSP}films`)
  })

  it("reads durations floored, with each number tied to its unit", () => {
    expect(formatRewindDuration(7, US)).toBe(`7${NBSP}minutes`)
    expect(formatRewindDuration(1, US)).toBe(`1${NBSP}minute`)
    expect(formatRewindDuration(47.9, US)).toBe(`47${NBSP}minutes`)
    expect(formatRewindDuration(440, US)).toBe(`7${NBSP}h 20${NBSP}m`)
    expect(formatRewindDuration(744, GB)).toBe(`12${NBSP}h 24${NBSP}m`)
    expect(formatRewindDuration(1307 * 60, US)).toBe(`1,307${NBSP}h`)
  })

  it('says "under 1%" for small shares and whole percents otherwise', () => {
    expect(formatShare(0.0001, US)).toBe("under 1%")
    expect(formatShare(0, US)).toBe("0%")
    expect(formatShare(0.34, US)).toBe("34%")
    expect(formatShare(0.01, GB)).toBe("1%")
  })

  it("keeps meridiems and dates on one line", () => {
    expect(formatHour(0, US)).toBe(`12${NBSP}AM`)
    expect(formatHour(15, US)).toBe(`3${NBSP}PM`)
    expect(formatHour(22, GB)).toBe("22:00")
    expect(formatDayMonth("2026-07-04", US)).toBe(`July${NBSP}4`)
    expect(formatDayMonth("2026-03-02", GB)).toBe(`2${NBSP}March`)
    for (const text of [formatHour(22, US), formatDayMonth("2026-07-04", GB), formatRewindDuration(1570, US)]) {
      expect(text).not.toMatch(/\d[  ]/)
    }
  })
})

describe("formatRunningTime and pluralWord", () => {
  it("rounds an issue's running time to 10 seconds", () => {
    expect(formatRunningTime(140_140)).toBe(`2${NBSP}min 20${NBSP}s`)
    expect(formatRunningTime(40_100)).toBe(`40${NBSP}s`)
    expect(formatRunningTime(120_000)).toBe(`2${NBSP}min`)
    expect(formatRunningTime(0)).toBe(`0${NBSP}s`)
  })

  it("picks the plural form alone", () => {
    expect(pluralWord(1, { one: "film", other: "films" }, US)).toBe("film")
    expect(pluralWord(112, { one: "film", other: "films" }, GB)).toBe("films")
  })
})
