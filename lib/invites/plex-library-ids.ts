import { z } from "zod"

/** Plex library section keys, as an invite or the affiliate settings store them. */
export const plexLibrarySectionIdsSchema = z.array(z.number().int().nonnegative()).max(100)

/**
 * An invite's stored `librarySectionIds`: `[]` when none are stored, or null
 * when the value is not a JSON array of section keys.
 */
export function parsePlexLibrarySectionIds(raw: string | null): number[] | null {
  if (raw === null) return []
  try {
    const parsed = plexLibrarySectionIdsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
