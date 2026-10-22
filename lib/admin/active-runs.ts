import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * When each member's queued or running Rewind generation for `year` started
 * (its `startedAt`, or `createdAt` while it is still queued), keyed by user
 * id: the `runStartedAt` that `canRegenerate` reads. Status columns only.
 */
export async function activeRunStarts(userIds: string[], year: number): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map()
  const runs = await prisma.rewindGeneration.findMany({
    where: { userId: { in: userIds }, year, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, startedAt: true, createdAt: true },
  })
  const starts = new Map<string, Date>()
  for (const run of runs) {
    if (!starts.has(run.userId)) starts.set(run.userId, run.startedAt ?? run.createdAt)
  }
  return starts
}
