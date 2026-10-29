/**
 * Saving the affiliate settings, and the switch's two ways off.
 *
 * | Change | Rule |
 * |---|---|
 * | on | needs a library list, Tautulli and the active Plex server's machine id, which it stores in `affiliatePlexMachineId` |
 * | off | cancels every open affiliate invite (`cancelledAt = now`, `label = null`), which frees their places |
 * | Plex server change | turns the switch off the same way when the active machine id is not the stored one |
 *
 * The Config write and the cancel run in one Serializable transaction, so a
 * parallel make-invite either commits first (and its invite is cancelled) or
 * conflicts, runs again and reads the switch off. Affiliates, used invites
 * and history stay.
 *
 * @module lib/affiliates/switch
 */

import "server-only"

import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { getActiveService } from "@/lib/data/active-service"
import { inSerializable } from "@/lib/db/serializable"
import type { PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { configDiff } from "@/lib/security/config-diff"
import type { AffiliateSettingsInput } from "@/lib/validations/affiliates"

const CONFIG_FIELDS = {
  affiliateInvitesEnabled: true,
  affiliateTiers: true,
  affiliateServerCap: true,
  affiliateLibrarySectionIds: true,
  affiliatePlexMachineId: true,
} as const

type OffCause = "switch_off" | "server_change"

/** Cancels every open affiliate invite (not used, not cancelled, not expired) and audits the count. */
async function cancelAllOpenInvites(tx: PrismaTransactionClient, cause: OffCause, actorId: string, now: Date): Promise<number> {
  const { count } = await tx.invite.updateMany({
    where: { kind: "AFFILIATE", joinedAt: null, cancelledAt: null, expiresAt: { gt: now } },
    data: { cancelledAt: now, label: null },
  })
  await recordAuditEvent(AuditEventType.AFFILIATE_INVITE_CANCELLED, actorId, { cause, count }, tx)
  return count
}

/** Why the switch cannot go on, or the machine id to store. */
async function switchOnTarget(): Promise<{ ok: true; machineId: string } | { ok: false; reason: string }> {
  if (!(await getActiveService("tautulli"))) {
    return { ok: false, reason: "Connect Tautulli before you turn on affiliate invites. The tiers use its watch hours." }
  }
  const plex = await getActiveService("plex")
  if (!plex) return { ok: false, reason: "Connect a Plex server before you turn on affiliate invites." }
  const { machineIdentifier } = await withMachineIdentifier(plex)
  if (!machineIdentifier) return { ok: false, reason: "Plex did not send its server ID. Make sure the Plex server is online, then try again." }
  return { ok: true, machineId: machineIdentifier }
}

export type SaveAffiliateSettingsResult = { ok: true; invitesCancelled: number } | { ok: false; reason: string }

/**
 * Saves the settings. Turning the switch on checks its preconditions first;
 * turning it off cancels the open invites in the same transaction.
 */
export async function saveAffiliateSettings(input: AffiliateSettingsInput, actorId: string): Promise<SaveAffiliateSettingsResult> {
  const target = input.enabled ? await switchOnTarget() : null
  if (target && !target.ok) return target

  return inSerializable(async (tx) => {
    const before = await tx.config.findUnique({ where: { id: "config" }, select: CONFIG_FIELDS })
    const after = {
      affiliateInvitesEnabled: input.enabled,
      affiliateTiers: input.tiers,
      affiliateServerCap: input.cap,
      affiliateLibrarySectionIds: input.libraryIds,
      affiliatePlexMachineId: target?.machineId ?? before?.affiliatePlexMachineId ?? null,
    }
    await tx.config.upsert({
      where: { id: "config" },
      create: { id: "config", ...after, updatedBy: actorId },
      update: { ...after, updatedBy: actorId },
    })
    const invitesCancelled =
      before?.affiliateInvitesEnabled && !input.enabled ? await cancelAllOpenInvites(tx, "switch_off", actorId, new Date()) : 0
    await recordAuditEvent(AuditEventType.CONFIG_CHANGED, actorId, configDiff("affiliates", before, after), tx)
    return { ok: true, invitesCancelled } as const
  })
}

/**
 * Turns the switch off after the active Plex server changed: a library key
 * can name a different library on another server. Does nothing unless the
 * switch is on and the active machine id is null or not the stored one.
 * Returns whether it turned the switch off.
 */
export async function turnOffForServerChange(actorId: string): Promise<boolean> {
  return inSerializable(async (tx) => {
    const config = await tx.config.findUnique({ where: { id: "config" }, select: { affiliateInvitesEnabled: true, affiliatePlexMachineId: true } })
    if (!config?.affiliateInvitesEnabled) return false
    const active = await tx.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { machineIdentifier: true } })
    if (active?.machineIdentifier && active.machineIdentifier === config.affiliatePlexMachineId) return false

    await tx.config.update({ where: { id: "config" }, data: { affiliateInvitesEnabled: false, updatedBy: actorId } })
    await cancelAllOpenInvites(tx, "server_change", actorId, new Date())
    await recordAuditEvent(
      AuditEventType.CONFIG_CHANGED,
      actorId,
      configDiff("affiliates", { affiliateInvitesEnabled: true }, { affiliateInvitesEnabled: false }),
      tx
    )
    return true
  })
}
