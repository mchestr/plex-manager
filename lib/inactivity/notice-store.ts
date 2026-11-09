/**
 * Reads and writes of the warning notice rows (`InactivityNotice`) for the
 * sweep, the warning step and the preview. The rules over them live in
 * `lib/inactivity/notices.ts`.
 *
 * Every write that changes a row's status is a compare-and-set on the status
 * it expects, and new rows go in with `skipDuplicates`, so a second run or a
 * second worker never adds a copy of a row: the unique key is member, cycle,
 * removal date and lead.
 *
 * @module lib/inactivity/notice-store
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import type { NoticeDetail } from "@/lib/inactivity/notice-lists"
import type { NoticePlan } from "@/lib/inactivity/notice-plan"
import {
  currentCycle,
  MAX_NOTICE_ATTEMPTS,
  removalGate,
  STALLED_SENDING_MS,
  type GateContext,
  type GateHold,
  type NoticeCode,
  type NoticeRow,
  type NoticeStatus,
  type WarningRules,
} from "@/lib/inactivity/notices"
import type { InactivityMember } from "@/lib/inactivity/rules"
import type { InactivityWarningSettings } from "@/lib/inactivity/settings"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"

const NOTICE_SELECT = {
  id: true,
  userId: true,
  cycleAt: true,
  leadDays: true,
  removeAfter: true,
  status: true,
  attempts: true,
  zone: true,
  handledAt: true,
} as const satisfies Prisma.InactivityNoticeSelect

/** A planned row as it is stored: `pending`, or `skipped` when the address failed the plex.tv check. */
export interface NoticeWrite extends NoticePlan {
  status: Extract<NoticeStatus, "pending" | "skipped">
  code: Extract<NoticeCode, "email_unconfirmed"> | null
}

/** Every notice row of `userIds`, in any cycle and status. */
export async function readNotices(userIds: readonly string[]): Promise<NoticeRow[]> {
  if (userIds.length === 0) return []
  return prisma.inactivityNotice.findMany({ where: { userId: { in: [...userIds] } }, select: NOTICE_SELECT })
}

/** Every notice row of `userIds`, with its code and when it last changed, for the admin lists. */
export async function readNoticeDetails(userIds: readonly string[]): Promise<NoticeDetail[]> {
  if (userIds.length === 0) return []
  return prisma.inactivityNotice.findMany({
    where: { userId: { in: [...userIds] } },
    select: { ...NOTICE_SELECT, code: true, updatedAt: true },
  })
}

/** The warning rules a run or the preview applies: null while warnings are off. */
export async function warningRules({ warningsEnabled, warningDays }: InactivityWarningSettings): Promise<WarningRules | null> {
  return warningsEnabled ? { warningDays, serverZone: await serverZone() } : null
}

/** What holds a member back from removal, or null when the sweep may remove them. */
export type RemovalGate = (member: InactivityMember) => GateHold | null

/** The removal gate (`removalGate`) over the members' rows, read once for a whole run or preview. */
export async function readRemovalGate(members: readonly InactivityMember[], ctx: GateContext): Promise<RemovalGate> {
  const rows = Map.groupBy(await readNotices(members.map((member) => member.id)), (row) => row.userId)
  return (member) => removalGate(member, rows.get(member.id) ?? [], ctx)
}

/** Marks rows left `sending` for over an hour `failed`, code `stalled`, so a later run can plan them again. */
export async function failStalledNotices(now: Date): Promise<number> {
  const { count } = await prisma.inactivityNotice.updateMany({
    where: { status: "sending" satisfies NoticeStatus, updatedAt: { lt: new Date(now.getTime() - STALLED_SENDING_MS) } },
    data: { status: "failed" satisfies NoticeStatus, code: "stalled" satisfies NoticeCode },
  })
  return count
}

const outcome = (write: NoticeWrite, now: Date) => ({ status: write.status, code: write.code, handledAt: write.status === "skipped" ? now : null })

/**
 * Stores the plans: new rows, and the rows they revive (`cancelled`, or
 * `failed` with fewer than 9 attempts). Returns how many rows it planned.
 */
export async function writeNotices(writes: readonly NoticeWrite[], { runId, now }: { runId: string; now: Date }): Promise<number> {
  const inserts = writes.filter((write) => write.reviveId === null)
  const { count: inserted } = inserts.length
    ? await prisma.inactivityNotice.createMany({
        data: inserts.map((write) => ({
          userId: write.userId,
          cycleAt: write.cycleAt,
          leadDays: write.leadDays,
          removeAfter: write.removeAfter,
          zone: write.zone,
          runId,
          ...outcome(write, now),
        })),
        skipDuplicates: true,
      })
    : { count: 0 }

  let revived = 0
  for (const write of writes.filter((candidate) => candidate.reviveId !== null)) {
    const { count } = await prisma.inactivityNotice.updateMany({
      where: {
        id: write.reviveId!,
        OR: [{ status: "cancelled" satisfies NoticeStatus }, { status: "failed" satisfies NoticeStatus, attempts: { lt: MAX_NOTICE_ATTEMPTS } }],
      },
      data: { runId, ...outcome(write, now) },
    })
    revived += count
  }
  return inserted + revived
}

/** The ids of the `pending` rows of the members' current cycles. */
export async function pendingNoticeIds(members: readonly InactivityMember[]): Promise<string[]> {
  if (members.length === 0) return []
  const rows = await prisma.inactivityNotice.findMany({
    where: { userId: { in: members.map((member) => member.id) }, status: "pending" satisfies NoticeStatus },
    select: NOTICE_SELECT,
  })
  return members.flatMap((member) => currentCycle(member, rows).map((row) => row.id))
}
