/**
 * The story's per-device preferences (Rewind design 4.6): Autoplay, Slower
 * pacing, Keyboard shortcuts and the small-screen choice. They are
 * conveniences for one device, so they live in `localStorage` under
 * `rewind:prefs:v1` and never reach the server (`RewindPrefs` keeps only the
 * share defaults and notifications).
 *
 * Every read and write sits in try/catch: a private window, blocked storage
 * or garbage JSON gives the defaults, and a failed write is dropped. The
 * stage loads this module on its first page, so it checks fields by hand
 * rather than with Zod (P7.15).
 *
 * @module lib/rewind/stage/prefs
 */

export const PREFS_KEY = "rewind:prefs:v1"

export interface StagePrefs {
  autoplay: boolean
  slowerPacing: boolean
  shortcuts: boolean
  /** What the member chose when the article-mode offer opened; null until then. */
  smallScreenChoice: "article" | "story" | null
}

export const DEFAULT_STAGE_PREFS: StagePrefs = Object.freeze({ autoplay: true, slowerPacing: false, shortcuts: true, smallScreenChoice: null })

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback)

/** A stored object's fields, each bad one replaced by its default; anything but an object gives null. */
function readFields(value: unknown): StagePrefs | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const stored = value as Record<string, unknown>
  const choice = stored.smallScreenChoice
  return {
    autoplay: flag(stored.autoplay, DEFAULT_STAGE_PREFS.autoplay),
    slowerPacing: flag(stored.slowerPacing, DEFAULT_STAGE_PREFS.slowerPacing),
    shortcuts: flag(stored.shortcuts, DEFAULT_STAGE_PREFS.shortcuts),
    smallScreenChoice: choice === "article" || choice === "story" ? choice : null,
  }
}

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
    return readFields(JSON.parse(raw)) ?? DEFAULT_STAGE_PREFS
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
