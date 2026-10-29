import "server-only"

import { getPlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"

/**
 * Whether the member's live Plex email (read with their stored Plex token) is
 * the email of another account, ignoring case. An application stores it as
 * `plexEmailShared`, a flag for the admins. False when there is no token or
 * plex.tv does not answer.
 */
export async function plexEmailIsShared(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plexAuthToken: true } })
  if (!user?.plexAuthToken) return false
  const info = await getPlexUserInfo(user.plexAuthToken)
  const email = info.success ? info.data?.email : undefined
  if (!email) return false
  const other = await prisma.user.findFirst({
    where: { id: { not: userId }, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  })
  return other !== null
}
