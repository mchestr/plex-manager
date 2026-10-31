import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"

export interface ApiTokenRow {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

/** The caller's own live API tokens, newest first (admin only); never a token or its hash. */
export async function listOwnApiTokens(now = new Date()): Promise<ApiTokenRow[]> {
  const session = await assertAdmin()
  const rows = await prisma.apiToken.findMany({
    where: { userId: session.user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
  })
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }))
}
