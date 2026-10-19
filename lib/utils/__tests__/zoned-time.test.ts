/**
 * Wall-clock arithmetic in a named zone (P2.2, RWP-03).
 *
 * Jest cannot change its own process zone, so the last suite recomputes
 * `zoned-time-fingerprint.ts` in child processes under `TZ=UTC` and
 * `TZ=Pacific/Kiritimati` (UTC+14) and requires identical answers: nothing
 * may read the process zone.
 */

import { execFileSync } from "node:child_process"
import path from "node:path"

import { fingerprint } from "@/lib/utils/__tests__/zoned-time-fingerprint"
import {
  dayKey,
  instantToWallTime,
  isWallTime,
  normalizeTimeZone,
  timeZoneOptions,
  wallTimeToInstant,
  zonedParts,
} from "@/lib/utils/zoned-time"

const ms = (iso: string) => Date.parse(iso)
const iso = (date: Date) => date.toISOString()

const ZONES = ["UTC", "America/Los_Angeles", "Europe/Berlin", "Australia/Sydney"] as const
type Zone = (typeof ZONES)[number]

/** 2026-03-11T05:00Z as hour and weekday (0 = Sunday) in each zone. */
const MARCH_11: Record<Zone, { hour: number; weekday: number; day: string }> = {
  UTC: { hour: 5, weekday: 3, day: "2026-03-11" },
  "America/Los_Angeles": { hour: 22, weekday: 2, day: "2026-03-10" },
  "Europe/Berlin": { hour: 6, weekday: 3, day: "2026-03-11" },
  "Australia/Sydney": { hour: 16, weekday: 3, day: "2026-03-11" },
}

/** 23:30 on 31 December 2026 in each zone, as an instant. */
const NEW_YEARS_EVE: Record<Zone, string> = {
  UTC: "2026-12-31T23:30:00.000Z",
  "America/Los_Angeles": "2027-01-01T07:30:00.000Z",
  "Europe/Berlin": "2026-12-31T22:30:00.000Z",
  "Australia/Sydney": "2026-12-31T12:30:00.000Z",
}

/**
 * The 2026 changes: the wall time in the spring gap, where it lands, the
 * ambiguous autumn wall time and the earlier of its two instants.
 */
const DST: Record<Exclude<Zone, "UTC">, { gap: string; gapLands: string; repeated: string; earlier: string }> = {
  "America/Los_Angeles": {
    gap: "2026-03-08T02:30",
    gapLands: "2026-03-08T10:30:00.000Z", // 03:30 PDT
    repeated: "2026-11-01T01:30",
    earlier: "2026-11-01T08:30:00.000Z", // 01:30 PDT, not PST
  },
  "Europe/Berlin": {
    gap: "2026-03-29T02:30",
    gapLands: "2026-03-29T01:30:00.000Z", // 03:30 CEST
    repeated: "2026-10-25T02:30",
    earlier: "2026-10-25T00:30:00.000Z", // 02:30 CEST, not CET
  },
  "Australia/Sydney": {
    gap: "2026-10-04T02:30",
    gapLands: "2026-10-03T16:30:00.000Z", // 03:30 AEDT
    repeated: "2026-04-05T02:30",
    earlier: "2026-04-04T15:30:00.000Z", // 02:30 AEDT, not AEST
  },
}

describe("in each zone", () => {
  describe.each(ZONES)("in %s", (zone) => {
    it("reads hour, weekday and day from Intl parts", () => {
      const parts = zonedParts(ms("2026-03-11T05:00:00Z"), zone)
      expect({ hour: parts.hour, weekday: parts.weekday, day: dayKey(ms("2026-03-11T05:00:00Z"), zone) }).toEqual(
        MARCH_11[zone],
      )
    })

    it("keeps 23:30 on 31 December inside that year", () => {
      const instant = wallTimeToInstant("2026-12-31T23:30", zone)
      expect(iso(instant)).toBe(NEW_YEARS_EVE[zone])
      expect(zonedParts(instant.getTime(), zone)).toMatchObject({ year: 2026, month: 12, day: 31, hour: 23 })
      expect(dayKey(instant.getTime(), zone)).toBe("2026-12-31")
    })

    it("round-trips a wall time", () => {
      expect(instantToWallTime(wallTimeToInstant("2026-07-04T18:45", zone), zone)).toBe("2026-07-04T18:45")
    })

    if (zone !== "UTC") {
      const change = DST[zone]

      it("moves a time in the spring gap forward", () => {
        expect(iso(wallTimeToInstant(change.gap, zone))).toBe(change.gapLands)
        expect(instantToWallTime(wallTimeToInstant(change.gap, zone), zone)).toBe(change.gap.replace("T02:", "T03:"))
      })

      it("takes the earlier instant of a repeated autumn time", () => {
        expect(iso(wallTimeToInstant(change.repeated, zone))).toBe(change.earlier)
      })

      it("buckets both sides of the autumn change by their own wall time", () => {
        const first = wallTimeToInstant(change.repeated, zone).getTime()
        const second = first + 3_600_000
        expect(zonedParts(first, zone).hour).toBe(zonedParts(second, zone).hour)
        expect(dayKey(first, zone)).toBe(dayKey(second, zone))
      })
    }
  })

  it("matches the hour table for Los Angeles from the plan", () => {
    // 2026-03-11T05:00Z is after the US change on 8 March, so PDT (UTC-7)
    expect(zonedParts(ms("2026-03-11T05:00:00Z"), "America/Los_Angeles")).toEqual({
      year: 2026,
      month: 3,
      day: 10,
      hour: 22,
      minute: 0,
      second: 0,
      weekday: 2,
    })
  })

  it("stores an announcement at 23:59 on 31 December in Los Angeles as 07:59Z on 1 January", () => {
    expect(iso(wallTimeToInstant("2026-12-31T23:59", "America/Los_Angeles"))).toBe("2027-01-01T07:59:00.000Z")
  })
})

describe.each(["UTC", "Pacific/Kiritimati"])("under the process zone %s", (processZone) => {
  it("gives the same answers as this process", () => {
    const root = path.resolve(__dirname, "../../..")
    const script =
      "import('./lib/utils/__tests__/zoned-time-fingerprint.ts').then((m) => " +
      "process.stdout.write(JSON.stringify({ offset: new Date('2026-06-01T00:00:00Z').getTimezoneOffset(), " +
      "fingerprint: (m.fingerprint ?? m.default.fingerprint)() })))"
    const output = execFileSync(path.join(root, "node_modules/.bin/tsx"), ["-e", script], {
      cwd: root,
      env: { ...process.env, TZ: processZone },
      encoding: "utf8",
    })
    const child = JSON.parse(output)
    expect(child.offset).toBe(processZone === "UTC" ? 0 : -14 * 60)
    expect(child.fingerprint).toEqual(JSON.parse(JSON.stringify(fingerprint())))
  }, 30_000)
})

describe("isWallTime", () => {
  it.each(["2026-12-31T23:59", "2028-02-29T00:00"])("accepts %s", (value) => {
    expect(isWallTime(value)).toBe(true)
  })

  it.each(["2026-02-29T10:00", "2026-13-01T00:00", "2026-12-31T24:00", "2026-12-31T23:60", "2026-12-31", "2026-12-31T23:59:00Z"])(
    "rejects %s",
    (value) => {
      expect(isWallTime(value)).toBe(false)
      expect(() => wallTimeToInstant(value, "UTC")).toThrow(RangeError)
    },
  )
})

describe("normalizeTimeZone", () => {
  it.each([
    ["US/Pacific", "America/Los_Angeles"],
    ["UTC", "UTC"],
    ["Etc/UTC", "UTC"],
    ["Europe/Berlin", "Europe/Berlin"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeTimeZone(input)).toBe(expected)
  })

  it.each(["Mars/Base", "", "+05:00", ":/etc/localtime", null, undefined])("rejects %p", (input) => {
    expect(normalizeTimeZone(input)).toBeNull()
  })

  it("lists UTC first, then every Intl zone, and every option normalizes to itself", () => {
    const options = timeZoneOptions()
    expect(options[0]).toBe("UTC")
    expect(options).toContain("America/Los_Angeles")
    for (const zone of options) expect(normalizeTimeZone(zone)).toBe(zone)
  })
})

describe("JSDoc examples", () => {
  it("zonedParts", () => {
    expect(zonedParts(Date.parse("2026-03-11T05:00:00Z"), "America/Los_Angeles")).toEqual({
      year: 2026, month: 3, day: 10, hour: 22, minute: 0, second: 0, weekday: 2,
    })
  })

  it("dayKey, wallTimeToInstant, instantToWallTime, normalizeTimeZone", () => {
    expect(dayKey(Date.parse("2026-12-31T23:30:00Z"), "Europe/Berlin")).toBe("2027-01-01")
    expect(wallTimeToInstant("2026-12-31T23:59", "America/Los_Angeles").toISOString()).toBe("2027-01-01T07:59:00.000Z")
    expect(instantToWallTime(new Date("2027-01-01T05:59:00Z"), "America/Chicago")).toBe("2026-12-31T23:59")
    expect(normalizeTimeZone("US/Pacific")).toBe("America/Los_Angeles")
    expect(normalizeTimeZone("Mars/Base")).toBeNull()
  })
})
