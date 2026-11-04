import "server-only"

import { getAvailableLibraries } from "@/actions/server-info"
import type { LibraryListing } from "@/types/invite"

/**
 * The active Plex server's movie, show and music sections for the
 * create-invite picker. The page starts it without awaiting, so the list
 * never waits for Plex; a failure says why instead of throwing.
 */
export async function plexLibraryListing(): Promise<LibraryListing> {
  const result = await getAvailableLibraries()
  if (!result.success) return { ok: false, reason: result.error }
  return {
    ok: true,
    libraries: result.data.map((library) => ({ id: String(library.id), name: library.title, type: library.type })),
  }
}
