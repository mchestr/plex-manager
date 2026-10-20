"use client"

import { useSyncExternalStore } from "react"

import { DEFAULT_STAGE_PREFS, parsePrefs, PREFS_KEY, readRawPrefs, writePrefs, type StagePrefs } from "@/lib/rewind/stage/prefs"

const listeners = new Set<() => void>()
/** What this tab chose when storage refused the write, so a switch still flips for the session. */
let unsaved: StagePrefs | null = null
let cached: { raw: string | null; prefs: StagePrefs } | null = null

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PREFS_KEY) listener()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** The same object while the stored string is unchanged, as `useSyncExternalStore` requires. */
function getSnapshot(): StagePrefs {
  if (unsaved) return unsaved
  const raw = readRawPrefs()
  if (cached?.raw !== raw) cached = { raw, prefs: parsePrefs(raw) }
  return cached.prefs
}

const getServerSnapshot = () => DEFAULT_STAGE_PREFS

export function updateRewindPrefs(patch: Partial<StagePrefs>): void {
  const next = { ...getSnapshot(), ...patch }
  unsaved = writePrefs(next) ? null : next
  notify()
}

/**
 * The per-device story preferences, kept in step across tabs through the
 * `storage` event. The server render and hydration use the defaults.
 */
export function useRewindPrefs(): StagePrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
