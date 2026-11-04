/**
 * The one rule for which media server a member uses (P11.10, GAP-24).
 *
 * A member is linked to a service by its identifier on the row
 * (`plexUserId`); `primaryAuthService` records the one they joined with.
 * Onboarding, Help and the home tiles read {@link primaryService}; anything
 * that acts on every linked account (quick links, Stripe grants, Discord
 * identity) reads {@link memberServices}. Plex is the only service, so a
 * member with no Plex account still reads as `plex`.
 *
 * @module lib/members/service
 */

import type { AuthService } from "@/types/onboarding"

export interface MemberIdentity {
  plexUserId: string | null
}

/** Every service the member has an account on. */
export function memberServices(user: MemberIdentity): AuthService[] {
  return user.plexUserId ? ["plex"] : []
}

const SERVICE_NAMES: Record<AuthService, string> = { plex: "Plex" }

/** The services as copy names them: "Plex". */
export function serviceNames(services: readonly AuthService[]): string {
  return services.map((service) => SERVICE_NAMES[service]).join(" and ")
}

/** The member's own service: always Plex. */
export function primaryService(_user: MemberIdentity & { primaryAuthService: AuthService | null }): AuthService {
  return "plex"
}
