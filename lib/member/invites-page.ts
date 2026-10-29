import { affiliateSettingsFrom, affiliateSwitchSelect } from "@/lib/affiliates/switch-state"
import { prisma } from "@/lib/prisma"

/**
 * Whether the member has an `/invites` page: the affiliate switch reads as on
 * (the rule `readAffiliateSettings` uses) and their account has a Plex id. It
 * reads no Tautulli.
 *
 * No `server-only`: `proxy.ts` asks it too, to give the page's not-found a
 * real 404 status.
 */
export async function hasInvitesPage(userId: string): Promise<boolean> {
  const [config, active, user] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: affiliateSwitchSelect }),
    prisma.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { machineIdentifier: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { plexUserId: true } }),
  ])
  return affiliateSettingsFrom(config, active?.machineIdentifier).on && !!user?.plexUserId
}
