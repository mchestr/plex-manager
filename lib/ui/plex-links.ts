/**
 * Links that open a title outside the app: an item in the server's Plex web
 * app, or a series' Overseerr page (P7.2; P10.21 reuses it for the home
 * page's quick links). Pure and client-safe.
 *
 * @example
 * ```ts
 * plexItemHref("abc123", "5114")
 * // "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F5114"
 * overseerrSeriesHref("https://requests.example.com/", 95396) // "https://requests.example.com/tv/95396"
 * ```
 *
 * @module lib/ui/plex-links
 */

import { safeHref } from "@/lib/ui/markdown"

/** Where the page links a title: the server's machine id and Overseerr's public URL, each null when unknown. */
export interface ItemLinks {
  plexServerId: string | null
  overseerrUrl: string | null
}

const RATING_KEY = /^\d{1,12}$/
const MACHINE_ID = /^[A-Za-z0-9-]{1,64}$/

/** The title's page in the Plex web app, or null for a key or server id that is not Plex's. */
export function plexItemHref(serverId: string | null, ratingKey: string): string | null {
  if (!serverId || !MACHINE_ID.test(serverId) || !RATING_KEY.test(ratingKey)) return null
  return `https://app.plex.tv/desktop/#!/server/${serverId}/details?key=${encodeURIComponent(`/library/metadata/${ratingKey}`)}`
}

/** A series' page on Overseerr by its TMDB id, or null without an http(s) base. */
export function overseerrSeriesHref(base: string | null, tmdbId: number): string | null {
  const root = safeHref(base)
  return root ? `${root.replace(/\/+$/, "")}/tv/${tmdbId}` : null
}
