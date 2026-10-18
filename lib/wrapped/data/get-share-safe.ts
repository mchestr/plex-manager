/**
 * Looks up a shared Rewind by its share token, straight from the database.
 *
 * The share page, its metadata, the share API and the OG image route all read
 * through this helper. The page used to fetch its own API over HTTP, which put
 * every visitor in the server's rate-limit bucket, counted each view twice and
 * turned a 429 into a 404 (RWP-09, SEC-26, RWV-05, BP-23).
 *
 * React `cache()` makes `generateMetadata` and the page share one lookup per
 * request. Outside a React render, as in a route handler, it simply calls
 * through.
 *
 * @module lib/wrapped/data/get-share-safe
 */

import "server-only"

import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { shareTokenSchema } from "@/lib/validations/shared-schemas"
import { toShareSafeV2, type ShareSafeRewindV2 } from "@/lib/wrapped/data/share-safe-v2"

export interface ShareSafeLookup {
  /** For recording the visit. It stays on the server and never reaches a response. */
  wrappedId: string
  /** The public projection, the only part a share response may carry. */
  share: ShareSafeRewindV2
}

/**
 * Returns the share-safe projection of the completed Rewind that `token`
 * shares, or `null` when there is none.
 *
 * A token that is not 43 base64url characters (what `generateShareToken`
 * makes) returns `null` without a database call. Unknown and revoked tokens,
 * and rows that are not `completed`, also return `null`, so callers answer
 * all of them with the same 404.
 *
 * @throws When the database call fails, or the stored row cannot be projected
 */
export const getShareSafeRewind = cache(async (token: string): Promise<ShareSafeLookup | null> => {
  if (!shareTokenSchema.safeParse(token).success) {
    return null
  }

  const wrapped = await prisma.plexWrapped.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      year: true,
      status: true,
      summary: true,
      archetype: true,
      data: true,
      user: { select: { name: true } },
    },
  })

  if (!wrapped || wrapped.status !== "completed") {
    return null
  }

  return { wrappedId: wrapped.id, share: toShareSafeV2(wrapped, wrapped.user) }
})
