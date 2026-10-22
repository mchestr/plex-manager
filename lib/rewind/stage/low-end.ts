/**
 * Low-end mode (Rewind design 5.6, 11.2): a phone with 4 cores or fewer,
 * 2 GB of memory or less, or Save-Data on gets the light version of the
 * story. The nameplate stretches with `scaleX` instead of the width axis,
 * the cover's soundtrack does not print in, and posters load at the
 * smallest width that covers 1x.
 *
 * A signal the browser does not expose (Safari has no `deviceMemory`, most
 * browsers no `navigator.connection`) counts as not low-end.
 *
 * @module lib/rewind/stage/low-end
 */

export interface LowEndSignals {
  hardwareConcurrency?: number
  deviceMemory?: number
  saveData?: boolean
}

const MAX_CORES = 4
const MAX_MEMORY_GB = 2

const known = (n: number | undefined): n is number => typeof n === "number" && n > 0

export function isLowEnd({ hardwareConcurrency, deviceMemory, saveData }: LowEndSignals): boolean {
  return (known(hardwareConcurrency) && hardwareConcurrency <= MAX_CORES) || (known(deviceMemory) && deviceMemory <= MAX_MEMORY_GB) || saveData === true
}

interface NavigatorSignals {
  hardwareConcurrency?: number
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

/** The signals `navigator` exposes; none on the server. */
export function readLowEndSignals(): LowEndSignals {
  if (typeof navigator === "undefined") return {}
  const nav = navigator as NavigatorSignals
  return { hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory, saveData: nav.connection?.saveData }
}

/** The `Save-Data` request header (`on`), read on the server so the first paint is already light. */
export function saveDataRequested(header: string | null): boolean {
  return header?.trim().toLowerCase() === "on"
}
