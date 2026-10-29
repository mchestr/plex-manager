/**
 * The affiliate switch rule, pure, so `readAffiliateSettings` and the proxy's
 * Invites page check (`hasInvitesPage`, which cannot import `server-only`)
 * read it the same way. The rule is in `lib/affiliates/settings`.
 *
 * @module lib/affiliates/switch-state
 */

import type { Prisma } from "@/lib/generated/prisma/client"
import { plexLibrarySectionIdsSchema } from "@/lib/invites/plex-library-ids"

/** The Config fields the switch reads. */
export const affiliateSwitchSelect = {
  affiliateInvitesEnabled: true,
  affiliateLibrarySectionIds: true,
  affiliatePlexMachineId: true,
} as const satisfies Prisma.ConfigSelect

type SwitchConfig = Prisma.ConfigGetPayload<{ select: typeof affiliateSwitchSelect }>

export interface AffiliateSettings {
  on: boolean
  /** The libraries every affiliate invite shares; empty while none are set. */
  librarySectionIds: number[]
}

/** The switch from its Config fields and the active Plex server's machine identifier. */
export function affiliateSettingsFrom(config: SwitchConfig | null, activeMachineId: string | null | undefined): AffiliateSettings {
  const libraries = plexLibrarySectionIdsSchema.safeParse(config?.affiliateLibrarySectionIds)
  const librarySectionIds = libraries.success ? libraries.data : []
  const sameServer = !!config?.affiliatePlexMachineId && activeMachineId === config.affiliatePlexMachineId
  return { on: !!config?.affiliateInvitesEnabled && librarySectionIds.length > 0 && sameServer, librarySectionIds }
}
