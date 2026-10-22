"use client"

import { useCallback, useSyncExternalStore } from "react"

import type { Cut } from "@/lib/rewind/editions"

/** The session key a cut is kept under, so a reload resumes the same cut (FR-4). */
const cutKey = (year: number) => `rewind:cut:${year}`

const listeners = new Set<() => void>()
/** What this tab chose when storage refused the write. */
const unsaved = new Map<number, Cut>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function readCut(year: number): Cut {
  const chosen = unsaved.get(year)
  if (chosen) return chosen
  try {
    return window.sessionStorage.getItem(cutKey(year)) === "pocket" ? "pocket" : "full"
  } catch {
    return "full"
  }
}

function writeCut(year: number, cut: Cut) {
  try {
    window.sessionStorage.setItem(cutKey(year), cut)
    unsaved.delete(year)
  } catch {
    unsaved.set(year, cut)
  }
  for (const listener of listeners) listener()
}

/**
 * The cut the member chose on the cover, kept in `sessionStorage` under
 * `rewind:cut:<year>`. The server render and hydration read `full`.
 */
export function useStoryCut(year: number): [Cut, (cut: Cut) => void] {
  const cut = useSyncExternalStore(
    subscribe,
    () => readCut(year),
    () => "full" as const
  )
  const choose = useCallback((next: Cut) => writeCut(year, next), [year])
  return [cut, choose]
}
