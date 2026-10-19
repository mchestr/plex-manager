/**
 * Every zone-dependent answer the Rewind time helpers give for a fixed set of
 * inputs, as plain JSON. `zoned-time.test.ts` computes it in Jest and in
 * child processes under other `TZ` values, and the three must be identical.
 */

import { dayKey, instantToWallTime, wallTimeToInstant, zonedParts } from "@/lib/utils/zoned-time"
import { dataWindow, paddedDateRange, yearWindow } from "@/lib/wrapped/time/zone"

const ZONES = ["UTC", "America/Los_Angeles", "Europe/Berlin", "Australia/Sydney"]
const INSTANTS = [
  "2026-03-11T05:00:00Z",
  "2026-03-08T10:30:00Z",
  "2026-03-29T01:30:00Z",
  "2026-10-04T15:59:59Z",
  "2026-10-25T00:30:00Z",
  "2026-11-01T09:30:00Z",
  "2026-12-31T23:30:00Z",
  "2027-01-01T07:30:00Z",
]
const WALL_TIMES = [
  "2026-03-08T02:30",
  "2026-03-29T02:30",
  "2026-04-05T02:30",
  "2026-10-04T02:30",
  "2026-10-25T02:30",
  "2026-11-01T01:30",
  "2026-12-31T23:30",
]

export function fingerprint() {
  return ZONES.map((zone) => ({
    zone,
    instants: INSTANTS.map((iso) => [zonedParts(Date.parse(iso), zone), dayKey(Date.parse(iso), zone)]),
    wallTimes: WALL_TIMES.map((wall) => {
      const instant = wallTimeToInstant(wall, zone)
      return [instant.toISOString(), instantToWallTime(instant, zone)]
    }),
    windows: [2026, 2028].map((year) => [
      yearWindow(year, zone),
      dataWindow(year, zone, { finalCut: false }),
      paddedDateRange(yearWindow(year, zone)),
    ]),
  }))
}
