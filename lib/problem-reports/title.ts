/**
 * How a report names its title: the key that makes one open report per
 * title, and the words lists show.
 *
 * @module
 */

/** The title's Plex guid, stable when the file changes; a title without one is keyed by its rating key. */
export function titleKeyOf(item: { guid?: string; ratingKey: string }): string {
  return item.guid ?? `plex-rating-key://${item.ratingKey}`
}

interface TitleParts {
  title: string
  year?: number | null
  showTitle?: string | null
  seasonNumber?: number | null
  episodeNumber?: number | null
}

/**
 * A title as lists show it: "Heat (1995)", or for an episode
 * "The Office S1E1: Pilot", as Your data shows marks.
 *
 * @example
 * ```ts
 * reportTitle({ title: "Heat", year: 1995 }) // "Heat (1995)"
 * reportTitle({ title: "Pilot", showTitle: "The Office", seasonNumber: 1, episodeNumber: 1 }) // "The Office S1E1: Pilot"
 * ```
 */
export function reportTitle({ title, year, showTitle, seasonNumber, episodeNumber }: TitleParts): string {
  if (showTitle && seasonNumber != null && episodeNumber != null) return `${showTitle} S${seasonNumber}E${episodeNumber}: ${title}`
  return year ? `${title} (${year})` : title
}
