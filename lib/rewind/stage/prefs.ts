/**
 * The story's per-device preferences (Rewind design 4.6): Autoplay, Slower
 * pacing, Keyboard shortcuts and the small-screen choice. They are
 * conveniences for one device, so they live in `localStorage` under
 * `rewind:prefs:v1` and never reach the server (`RewindPrefs` keeps only the
 * share defaults and notifications).
 *
 * Every read and write sits in try/catch: a private window, blocked storage
 * or garbage JSON gives the defaults, and a failed write is dropped.
 *
 * @module lib/rewind/stage/prefs
 */

import { z } from "zod"

export const PREFS_KEY = "rewind:prefs:v1"

const StagePrefsSchema = z.object({
  autoplay: z.boolean().catch(true),
  slowerPacing: z.boolean().catch(false),
  shortcuts: z.boolean().catch(true),
  /** What the member chose when the article-mode offer opened; null until then. */
  smallScreenChoice: z.enum(["article", "story"]).nullable().catch(null),
})

export type StagePrefs = z.infer<typeof StagePrefsSchema>

export const DEFAULT_STAGE_PREFS: StagePrefs = Object.freeze({ autoplay: true, slowerPacing: false, shortcuts: true, smallScreenChoice: null })

/** The raw stored string, or null when storage is empty or unavailable. */
export function readRawPrefs(): string | null {
  try {
    return window.localStorage.getItem(PREFS_KEY)
  } catch {
    return null
  }
}

/** Parses a stored value; anything unreadable gives the defaults, and a bad field its default. */
export function parsePrefs(raw: string | null): StagePrefs {
  if (raw === null) return DEFAULT_STAGE_PREFS
  try {
    const parsed = StagePrefsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_STAGE_PREFS
  } catch {
    return DEFAULT_STAGE_PREFS
  }
}

export function readPrefs(): StagePrefs {
  return parsePrefs(readRawPrefs())
}

/** Stores the merged preferences; returns false when storage refused the write. */
export function writePrefs(patch: Partial<StagePrefs>): boolean {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
    return true
  } catch {
    return false
  }
}
