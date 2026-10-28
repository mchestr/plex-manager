import { normalizeTimeZone } from "@/lib/utils/zoned-time"

/**
 * The browser's IANA zone, or null when it is not one the app knows (an
 * offset, "Etc/Unknown"). Client code only: on the server it reads the
 * process zone.
 */
export function browserTimeZone(): string | null {
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
}
