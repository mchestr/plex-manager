/**
 * The one rule for which media server a member uses (P11.10, GAP-24).
 *
 * A member is linked to a service by its identifier on the row
 * (`plexUserId`, `jellyfinUserId`); `primaryAuthService` records the one they
 * joined with. Onboarding, Help and the home tiles read {@link primaryService};
 * anything that acts on every linked account (quick links, Stripe grants,
 * Discord identity) reads {@link memberServices}.
 *
 * | Linked          | Stored       | primaryService |
 * |-----------------|--------------|----------------|
 * | Plex            | any          | plex           |
 * | Jellyfin        | any          | jellyfin       |
 * | both            | jellyfin     | jellyfin       |
 * | both            | plex or null | plex           |
 * | neither         | any          | plex           |
 *
 * @module lib/members/service
 */

import type { AuthService } from "@/types/onboarding"

export interface MemberIdentity {
  plexUserId: string | null
  jellyfinUserId: string | null
}

/** Every service the member has an account on, Plex first. */
export function memberServices(user: MemberIdentity): AuthService[] {
  const services: AuthService[] = []
  if (user.plexUserId) services.push("plex")
  if (user.jellyfinUserId) services.push("jellyfin")
  return services
}

const SERVICE_NAMES: Record<AuthService, string> = { plex: "Plex", jellyfin: "Jellyfin" }

/** The services as copy names them: "Plex", "Jellyfin" or "Plex and Jellyfin". */
export function serviceNames(services: readonly AuthService[]): string {
  return services.map((service) => SERVICE_NAMES[service]).join(" and ")
}

/**
 * The member's own service: the stored one when it is linked, else the only
 * linked one, else Plex.
 */
export function primaryService(user: MemberIdentity & { primaryAuthService: AuthService | null }): AuthService {
  const linked = memberServices(user)
  if (user.primaryAuthService && linked.includes(user.primaryAuthService)) return user.primaryAuthService
  const [only, other] = linked
  return only && !other ? only : "plex"
}
