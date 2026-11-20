/**
 * The read time of the library data, as the preview head and Results say
 * it: "3:07 AM today", else the date and time ("Nov 3, 2026, 3:07 AM").
 * "Today" is the day of `now` in the app zone. Client-safe.
 *
 * @module components/admin/cleanup/preview/read-time
 */

import type { BoundFormat } from "@/lib/utils/format"

export function readTimeText(f: BoundFormat, at: string, now: number): string {
  return f.date(at) === f.date(now) ? `${f.time(at)} today` : f.dateTime(at)
}
