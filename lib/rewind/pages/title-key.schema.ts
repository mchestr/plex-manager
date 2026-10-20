import { z } from "zod"

/** A title's list key, `film:<ratingKey>` or `series:<grandparentRatingKey>`. */
export const TitleKeySchema = z.string().regex(/^(?:film|series):[^\s]+$/)

/** The id part of a title key: the rating key the share projection hides by. */
export const ratingKeyOf = (key: string) => key.slice(key.indexOf(":") + 1)

/**
 * The rating key the poster route takes, from a title key; null when the key
 * is not a Plex rating key (a Jellyfin id), so the slot shows its title card.
 */
export function posterKey(key: string): string | null {
  const id = key.slice(key.indexOf(":") + 1)
  return /^\d{1,12}$/.test(id) ? id : null
}
