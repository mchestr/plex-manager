/**
 * Which media services a member uses, from the identifiers stored on their
 * row. Pure, so client and server code can share it.
 *
 * @module lib/members/service
 */

export type MemberService = "plex" | "jellyfin"

/** The services a member has an identity on, Plex first. */
export function memberServices(user: { plexUserId: string | null; jellyfinUserId: string | null }): MemberService[] {
  const services: MemberService[] = []
  if (user.plexUserId) services.push("plex")
  if (user.jellyfinUserId) services.push("jellyfin")
  return services
}
