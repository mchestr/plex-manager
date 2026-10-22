import { prisma } from "@/lib/prisma"

/**
 * Whether the member has a `/membership` page (ui-design-system 6.1): Stripe
 * is on, or they have a subscription row from when it was.
 *
 * No `server-only` and no Stripe import: `proxy.ts` asks it too, to give the
 * page's not-found a real 404 status.
 */
export async function hasMembershipPage(userId: string): Promise<boolean> {
  const [config, subscription] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { stripeEnabled: true } }),
    prisma.subscription.findUnique({ where: { userId }, select: { id: true } }),
  ])
  return Boolean(config?.stripeEnabled || subscription)
}
