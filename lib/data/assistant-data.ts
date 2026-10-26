/**
 * The admin assistant's reads of the app's own data: server-only, read-only,
 * and admin-checked next to the data like every other `lib/data/*` loader.
 * Results carry no emails, tokens or Stripe ids.
 *
 * @module lib/data/assistant-data
 */

import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { inviteStatusWhere } from "@/lib/admin/invites/queries"
import { listQueueJobs } from "@/lib/admin/queues"
import { memberServices } from "@/lib/members/service"
import { prisma } from "@/lib/prisma"
import { isRedisConfigured } from "@/lib/queue/connection"

const invitesInput = z.object({
  status: z.enum(["active", "expired", "usedUp", "all"]).default("active"),
  expiresWithinDays: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

/** Free text from a job or a note: no email addresses, at most 200 characters. */
function redact(text: string | null | undefined): string | null {
  if (!text) return null
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]").slice(0, 200)
}

/**
 * Invites by status, optionally only those that expire within N days (admin
 * only). The status filter is part of the query, so `limit` applies to
 * matching invites. A code is shown by its last four characters: it redeems
 * the invite, and this text goes to the model provider.
 */
export async function getAssistantInvites(raw: z.input<typeof invitesInput> = {}) {
  await assertAdmin()
  const { status, expiresWithinDays, limit } = invitesInput.parse(raw)
  const now = new Date()
  const until = expiresWithinDays ? new Date(now.getTime() + expiresWithinDays * 86_400_000) : null

  const rows = await prisma.invite.findMany({
    where: { AND: [inviteStatusWhere(status, now), until ? { expiresAt: { gte: now, lte: until } } : {}] },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, code: true, serverType: true, maxUses: true, useCount: true, expiresAt: true, createdAt: true },
  })

  const invites = rows.map(({ code, ...invite }) => ({ ...invite, codeEnd: code.slice(-4) }))
  return { count: invites.length, invites }
}

const memberInput = z.object({ query: z.string().trim().min(2).max(100) })

/**
 * One member's access, subscription and recent Rewind runs, found by name,
 * email or user id (admin only). A query that matches several members lists
 * them so the model can ask which one.
 */
export async function getAssistantMember(raw: z.input<typeof memberInput>) {
  await assertAdmin()
  const { query } = memberInput.parse(raw)

  const matches = await prisma.user.findMany({
    where: {
      OR: [
        { id: query },
        { name: { contains: query, mode: "insensitive" } },
        { email: { equals: query, mode: "insensitive" } },
      ],
    },
    take: 5,
    select: { id: true, name: true },
  })
  if (matches.length === 0) return { found: false as const }
  if (matches.length > 1) return { found: false as const, candidates: matches }

  const user = await prisma.user.findUnique({
    where: { id: matches[0].id },
    select: {
      id: true,
      name: true,
      plexUserId: true,
      jellyfinUserId: true,
      isAdmin: true,
      isExempt: true,
      exemptReason: true,
      disabledAt: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          plexInviteStatus: true,
          jellyfinAccessStatus: true,
          accessSkipCode: true,
        },
      },
      plexWrapped: {
        orderBy: { year: "desc" },
        take: 2,
        select: { year: true, status: true, error: true, generatedAt: true },
      },
      rewindGenerations: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { year: true, kind: true, status: true, error: true, startedAt: true, finishedAt: true },
      },
    },
  })
  if (!user) return { found: false as const }

  const { plexUserId, jellyfinUserId, exemptReason, plexWrapped, rewindGenerations, ...rest } = user
  return {
    found: true as const,
    member: {
      ...rest,
      exemptReason: redact(exemptReason),
      plexWrapped: plexWrapped.map((wrapped) => ({ ...wrapped, error: redact(wrapped.error) })),
      rewindGenerations: rewindGenerations.map((run) => ({ ...run, error: redact(run.error === null ? null : JSON.stringify(run.error)) })),
      services: memberServices({ plexUserId, jellyfinUserId }),
      hasPlexAccount: plexUserId !== null,
      hasJellyfinAccount: jellyfinUserId !== null,
    },
  }
}

const failuresInput = z.object({ limit: z.number().int().min(1).max(25).default(10) })

/** The newest failed background jobs with their errors (admin only). */
export async function getAssistantFailedJobs(raw: z.input<typeof failuresInput> = {}) {
  await assertAdmin()
  const { limit } = failuresInput.parse(raw)
  if (!isRedisConfigured()) return { redisConfigured: false as const, total: 0, jobs: [] }
  const { rows, total } = await listQueueJobs({ status: "failed", page: 1, pageSize: limit })
  return { redisConfigured: true as const, total, jobs: rows.map((job) => ({ ...job, error: redact(job.error) })) }
}
