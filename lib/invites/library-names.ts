import "server-only"

import { unstable_cache } from "next/cache"
import { z } from "zod"

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { serviceErrorMessage, serviceFetch } from "@/lib/connections/http"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("invite-libraries")

const ALL_LIBRARIES = "All libraries"

/** Five minutes: library names change rarely, and an invite page should not wait on the server each visit. */
const SECTION_LISTING_TTL = 300

const plexSectionsSchema = z.looseObject({
  MediaContainer: z
    .looseObject({ Directory: z.array(z.looseObject({ key: z.coerce.string(), title: z.string() })).optional() })
    .optional(),
})

/** The active Plex server's section keys and titles. Throws on failure, so a failure is never cached. */
const plexSectionNames = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const config = await getActivePlexServerConfig()
    if (!config) return {}
    const result = await serviceFetch({
      service: "Plex",
      url: `${config.url}/library/sections`,
      headers: { "X-Plex-Token": config.token },
      schema: plexSectionsSchema,
    })
    if (!result.ok) throw new Error(serviceErrorMessage("Plex", result))
    const sections = result.data.MediaContainer?.Directory ?? []
    return Object.fromEntries(sections.map((section) => [section.key, section.title]))
  },
  ["invite-plex-section-names"],
  { revalidate: SECTION_LISTING_TTL },
)

const storedIdsSchema = z.array(z.union([z.string(), z.number()]))

function storedIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = storedIdsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.map(String) : []
  } catch {
    return []
  }
}

function countLabel(n: number): string {
  return n === 1 ? "1 library" : `${n} libraries`
}

/**
 * The names behind an invite's `librarySectionIds`, from a cached Plex section
 * listing.
 *
 * - No stored ids: `["All libraries"]`.
 * - A name the listing does not have, or a listing that fails, falls back to
 *   a count ("2 more", "3 libraries"), never an id.
 */
export async function inviteLibraryNames(invite: { librarySectionIds: string | null }): Promise<string[]> {
  const ids = storedIds(invite.librarySectionIds)
  if (ids.length === 0) return [ALL_LIBRARIES]

  let names: Record<string, string> = {}
  try {
    names = await plexSectionNames()
  } catch (error) {
    logger.warn("Could not list libraries for an invite", { error })
  }

  const resolved = ids.flatMap((id) => (names[id] ? [names[id]] : []))
  const missing = ids.length - resolved.length
  if (resolved.length === 0) return [countLabel(missing)]
  return missing > 0 ? [...resolved, `${missing} more`] : resolved
}
