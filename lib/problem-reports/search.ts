/**
 * A title search for a member, for `/report` on the web and in Discord:
 * Plex's search, kept to movies, shows and episodes in the libraries shared
 * with the member (SEC-21, `inLibraries`). Display fields come from Plex.
 *
 * @module lib/problem-reports/search
 */

import "server-only"

import { searchPlexMedia } from "@/lib/connections/plex"
import type { PlexServerConfig } from "@/lib/connections/plex-config"
import { inLibraries, type LibraryAccess } from "@/lib/problem-reports/access"
import { REPORTABLE_MEDIA_TYPES, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { reportTitle } from "@/lib/problem-reports/title"

/** A title the member may report, with the rating key of its poster. */
export interface FoundTitle {
  ratingKey: string
  type: ReportableType
  title: string
  posterKey: string
}

const isReportable = (type: string): type is ReportableType => Object.hasOwn(REPORTABLE_MEDIA_TYPES, type)

/**
 * The first `limit` matches for `query` that the member may report, or
 * `null` when Plex can't be searched.
 */
export async function searchMemberTitles(server: PlexServerConfig, access: LibraryAccess, query: string, limit: number): Promise<FoundTitle[] | null> {
  const found = await searchPlexMedia(server, query)
  if (!found.success) return null
  return (found.data ?? [])
    .flatMap((item) =>
      isReportable(item.type) && inLibraries(access, item.librarySectionId)
        ? [
            {
              ratingKey: item.ratingKey,
              type: item.type,
              title: reportTitle({ ...item, showTitle: item.grandparentTitle, seasonNumber: item.parentIndex, episodeNumber: item.index }),
              posterKey: item.ratingKey,
            },
          ]
        : []
    )
    .slice(0, limit)
}
