/**
 * Sizes on the preview card, the Results list and the count bar. Bytes come
 * as decimal strings (TS 10.5). A live region speaks a size as words: "1.3
 * terabytes", not "1.3 TB" (UX 7.10 item 5, TS 12.7 item 9). Client-safe.
 *
 * @module components/admin/cleanup/preview/sizes
 */

import { formatBytes } from "@/lib/utils/format"

/** A byte count as `formatBytes` shows it. Zero reads "0 GB" (UX 4.3.9), and an unknown size "Unknown". */
export function sizeText(bytes: string | null): string {
  if (bytes === null) return "Unknown"
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return "0 GB"
  return formatBytes(value)
}

const UNIT_WORDS: Record<string, readonly [string, string]> = {
  Bytes: ["byte", "bytes"],
  KB: ["kilobyte", "kilobytes"],
  MB: ["megabyte", "megabytes"],
  GB: ["gigabyte", "gigabytes"],
  TB: ["terabyte", "terabytes"],
  PB: ["petabyte", "petabytes"],
}

/** A size text with its units as words, for a live region: "1.3 TB" reads "1.3 terabytes", "1 GB" "1 gigabyte". */
export function spokenSize(text: string): string {
  return text.replace(/(\d+(?:\.\d+)?) (Bytes|KB|MB|GB|TB|PB)\b/g, (_, amount: string, unit: string) => {
    const [one, many] = UNIT_WORDS[unit]
    return `${amount} ${Number(amount) === 1 ? one : many}`
  })
}
